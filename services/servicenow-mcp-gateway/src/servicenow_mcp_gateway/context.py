# pyright: reportMissingImports=false
"""Signed Maiah context validation and ServiceNow connection configuration."""
from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import socket
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import BaseModel, Field, ValidationError
from servicenow_mcp.utils.config import ApiKeyConfig, AuthConfig, AuthType, BasicAuthConfig, OAuthConfig, ServerConfig
from starlette.exceptions import HTTPException
from starlette.requests import Request

from starlette.routing import Mount, Route

logger = logging.getLogger("servicenow_mcp_gateway")

CONTEXT_HEADER = "x-maiah-tool-context"
SIGNATURE_HEADER = "x-maiah-tool-context-signature"
DEFAULT_INSTANCE_URL = "https://example.service-now.com"
DEFAULT_USERNAME = "maiah-list-tools"
DEFAULT_PASSWORD = "maiah-list-tools"


class GatewayContext(BaseModel):
    """Signed context produced by Maiah for one user/tool execution."""

    version: int = 1
    workspaceId: str
    userId: str
    connectorId: str
    connectorKey: str
    connectionId: str
    issuedAt: int
    expiresAt: int
    config: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)
    secrets: Dict[str, str] = Field(default_factory=dict)


def _shared_secret() -> bytes:
    secret = os.getenv("MAIAH_MCP_GATEWAY_SHARED_SECRET") or os.getenv(
        "MCP_GATEWAY_SHARED_SECRET"
    )
    if not secret:
        raise RuntimeError(
            "MAIAH_MCP_GATEWAY_SHARED_SECRET or MCP_GATEWAY_SHARED_SECRET is required"
        )
    return secret.encode("utf-8")


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _verify_signature(encoded_context: str, signature: str) -> None:
    expected = hmac.new(
        _shared_secret(), encoded_context.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid Maiah tool context signature")


def _decrypt_context_payload(encoded_context: str) -> Dict[str, Any]:
    try:
        envelope = json.loads(_decode_base64url(encoded_context))
        if not isinstance(envelope, dict) or envelope.get("alg") != "A256GCM":
            raise ValueError("Unsupported context envelope")
        iv = _decode_base64url(str(envelope["iv"]))
        ciphertext = _decode_base64url(str(envelope["ciphertext"]))
        tag = _decode_base64url(str(envelope["tag"]))
        plaintext = AESGCM(hashlib.sha256(_shared_secret()).digest()).decrypt(
            iv, ciphertext + tag, None
        )
        payload = json.loads(plaintext)
    except (KeyError, TypeError, ValueError, InvalidTag) as exc:
        raise HTTPException(
            status_code=400, detail="Invalid encrypted Maiah tool context"
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid Maiah tool context")
    return payload


def read_gateway_context(request: Request) -> Optional[GatewayContext]:
    encoded_context = request.headers.get(CONTEXT_HEADER)
    signature = request.headers.get(SIGNATURE_HEADER)
    if not encoded_context and not signature:
        return None
    if not encoded_context or not signature:
        raise HTTPException(status_code=401, detail="Incomplete Maiah tool context")

    _verify_signature(encoded_context, signature)
    try:
        payload = _decrypt_context_payload(encoded_context)
        context = GatewayContext.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Invalid Maiah tool context") from exc

    now_ms = int(time.time() * 1000)
    if context.expiresAt < now_ms:
        raise HTTPException(status_code=401, detail="Expired Maiah tool context")
    if context.issuedAt > now_ms + 30_000:
        raise HTTPException(status_code=401, detail="Maiah tool context is not active yet")
    if context.connectorKey != "servicenow":
        raise HTTPException(status_code=400, detail="Context connector is not ServiceNow")
    return context


def _allowed_suffixes() -> List[str]:
    raw = os.getenv("SERVICENOW_ALLOWED_HOST_SUFFIXES", "service-now.com")
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def _resolve_hosts_enabled() -> bool:
    return os.getenv("SERVICENOW_GATEWAY_RESOLVE_HOSTS", "true").lower() not in {
        "0",
        "false",
        "no",
    }


def _is_public_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_instance_url(instance_url: str) -> str:
    parsed = urlparse(instance_url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(status_code=400, detail="ServiceNow instance URL must be HTTPS")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="ServiceNow instance URL must be a base URL")

    hostname = parsed.hostname.lower()
    suffixes = _allowed_suffixes()
    if "*" not in suffixes and not any(
        hostname == suffix or hostname.endswith(f".{suffix}") for suffix in suffixes
    ):
        raise HTTPException(
            status_code=400,
            detail="ServiceNow instance host is not allowed by gateway policy",
        )

    try:
        if not _is_public_ip(hostname):
            raise HTTPException(status_code=400, detail="ServiceNow instance IP is not public")
    except ValueError:
        if _resolve_hosts_enabled():
            try:
                resolved = {
                    str(result[4][0])
                    for result in socket.getaddrinfo(hostname, parsed.port or 443)
                }
            except socket.gaierror as exc:
                raise HTTPException(
                    status_code=400, detail="ServiceNow instance host cannot be resolved"
                ) from exc
            if not resolved or any(not _is_public_ip(address) for address in resolved):
                raise HTTPException(
                    status_code=400,
                    detail="ServiceNow instance host resolved to a non-public address",
                )

    return instance_url.rstrip("/")


def auth_config_from_context(context: GatewayContext) -> AuthConfig:
    auth_type = str(context.config.get("authType") or "basic")
    secrets = context.secrets

    if auth_type == AuthType.API_KEY.value:
        api_key = secrets.get("apiKey") or secrets.get("api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="ServiceNow API key is missing")
        return AuthConfig(
            type=AuthType.API_KEY,
            api_key=ApiKeyConfig(
                api_key=api_key,
                header_name=str(context.config.get("apiKeyHeader") or "X-ServiceNow-API-Key"),
            ),
        )

    if auth_type == AuthType.OAUTH.value:
        required = ["clientId", "clientSecret", "username", "password"]
        missing = [key for key in required if not secrets.get(key)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"ServiceNow OAuth secrets missing: {', '.join(missing)}",
            )
        return AuthConfig(
            type=AuthType.OAUTH,
            oauth=OAuthConfig(
                client_id=secrets["clientId"],
                client_secret=secrets["clientSecret"],
                username=secrets["username"],
                password=secrets["password"],
                token_url=str(context.config.get("tokenUrl"))
                if context.config.get("tokenUrl")
                else None,
            ),
        )

    username = secrets.get("username")
    password = secrets.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="ServiceNow username/password are missing")
    return AuthConfig(
        type=AuthType.BASIC,
        basic=BasicAuthConfig(username=username, password=password),
    )


def server_config_from_context(context: Optional[GatewayContext]) -> ServerConfig:
    if context is None:
        return ServerConfig(
            instance_url=DEFAULT_INSTANCE_URL,
            auth=AuthConfig(
                type=AuthType.BASIC,
                basic=BasicAuthConfig(
                    username=DEFAULT_USERNAME,
                    password=DEFAULT_PASSWORD,
                ),
            ),
        )

    raw_instance_url = context.config.get("instanceUrl") or context.config.get("instance_url")
    if not isinstance(raw_instance_url, str) or not raw_instance_url.strip():
        raise HTTPException(status_code=400, detail="ServiceNow instance URL is missing")
    return ServerConfig(
        instance_url=validate_instance_url(raw_instance_url.strip()),
        auth=auth_config_from_context(context),
        debug=os.getenv("SERVICENOW_GATEWAY_DEBUG", "false").lower() == "true",
    )


