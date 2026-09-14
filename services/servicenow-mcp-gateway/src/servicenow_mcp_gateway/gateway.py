# pyright: reportMissingImports=false
"""Per-session ServiceNow MCP server construction."""
from __future__ import annotations

import logging
import os
import asyncio
import json
from importlib.resources import files
from pathlib import Path
from typing import Any, Dict, Optional

from mcp.server import Server
from mcp import types
from pydantic import ValidationError
import yaml
from servicenow_mcp.server import ServiceNowMCP
from servicenow_mcp.utils.config import ServerConfig

from .context import GatewayContext, server_config_from_context
from .form_tools import FORM_TOOLS
from .rest_client import ServiceNowRest

logger = logging.getLogger("servicenow_mcp_gateway")

class GatewayServiceNowMCP(ServiceNowMCP):
    """ServiceNow MCP with per-session package selection and call guard."""

    def __init__(self, config: ServerConfig, *, context_present: bool, tool_package: str):
        self._gateway_context_present = context_present
        self._gateway_tool_package = tool_package
        super().__init__(config)
        self._form_client = ServiceNowRest(self.config, self.auth_manager)

    def _load_package_config(self):
        # Upstream resolves relative paths inside its own distribution. Use our bundled
        # package definitions for both local installations and Docker sessions.
        path = os.getenv("TOOL_PACKAGE_CONFIG_PATH")
        bundled = files(__package__).joinpath("tool_packages.yaml")
        if path:
            source = open(path)
        elif bundled.is_file():
            source = bundled.open()
        else:
            # Editable development install; wheels contain the resource above.
            source = (Path(__file__).resolve().parents[2] / "config/tool_packages.yaml").open()
        with source:
            packages = yaml.safe_load(source)
        if not isinstance(packages, dict) or any(
            not isinstance(names, list) or any(not isinstance(name, str) for name in names)
            for names in packages.values()
        ):
            raise ValueError("Invalid ServiceNow tool package configuration")
        self.package_definitions = packages

    async def _list_tools_impl(self):
        tools = await super()._list_tools_impl()
        for name, definition in FORM_TOOLS.items():
            if name in self.enabled_tool_names:
                tools.append(types.Tool(
                    name=name, description=definition.description,
                    inputSchema=definition.model.model_json_schema(),
                    annotations={"readOnlyHint": not definition.writes,
                                 "destructiveHint": definition.writes,
                                 "idempotentHint": not definition.writes,
                                 "openWorldHint": True},
                ))
        return tools

    def _determine_enabled_tools(self):
        requested_package = (self._gateway_tool_package or "full").strip() or "full"

        if requested_package in self.package_definitions:
            self.current_package_name = requested_package
        else:
            self.current_package_name = "none"
            logger.warning(
                "Invalid ServiceNow MCP tool package requested",
                extra={"requested_package": requested_package},
            )

        if self.package_definitions:
            self.enabled_tool_names = self.package_definitions.get(
                self.current_package_name, []
            )
        else:
            self.enabled_tool_names = []

        logger.info(
            "ServiceNow MCP package selected",
            extra={
                "package": self.current_package_name,
                "tool_count": len(self.enabled_tool_names),
            },
        )

    async def _call_tool_impl(self, name: str, arguments: Dict[str, Any]):
        if not self._gateway_context_present:
            raise RuntimeError("Missing Maiah tool context for ServiceNow tool call")
        if name in FORM_TOOLS:
            if name not in self.enabled_tool_names:
                raise ValueError(f"Tool '{name}' is not enabled in this package")
            definition = FORM_TOOLS[name]
            try:
                params = definition.model(**arguments)
            except ValidationError as exc:
                # Pydantic errors normally include the submitted values.
                raise ValueError(json.dumps(exc.errors(include_input=False, include_url=False))) from None
            result = await asyncio.to_thread(definition.execute, self._form_client, params)
            if definition.writes and isinstance(result, dict) and result.get("errors"):
                raise ValueError("Form validation failed: " + json.dumps(result["errors"]))
            return [types.TextContent(type="text", text=json.dumps(result))]
        result = await super()._call_tool_impl(name, arguments)
        for content in result:
            if getattr(content, "type", None) != "text":
                continue
            try:
                payload = json.loads(content.text)
            except (ValueError, TypeError):
                continue
            if isinstance(payload, dict) and payload.get("success") is False:
                raise RuntimeError("ServiceNow reported a failed operation. Check permissions and the remote record before retrying a write.")
        return result


def tool_package_from_context(context: Optional[GatewayContext]) -> str:
    if context is None:
        return os.getenv("SERVICENOW_MCP_TOOL_PACKAGE", "full")
    package = context.settings.get("toolPackage") or context.config.get("toolPackage")
    return str(package or os.getenv("SERVICENOW_MCP_TOOL_PACKAGE", "full"))


def create_gateway_mcp(context: Optional[GatewayContext]) -> Server:
    config = server_config_from_context(context)
    gateway = GatewayServiceNowMCP(
        config,
        context_present=context is not None,
        tool_package=tool_package_from_context(context),
    )
    return gateway.start()
