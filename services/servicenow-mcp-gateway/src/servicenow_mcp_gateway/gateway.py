# pyright: reportMissingImports=false
"""Per-session ServiceNow MCP server construction."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from mcp.server import Server
from servicenow_mcp.server import ServiceNowMCP
from servicenow_mcp.utils.config import ServerConfig

from .context import GatewayContext, server_config_from_context

logger = logging.getLogger("servicenow_mcp_gateway")

class GatewayServiceNowMCP(ServiceNowMCP):
    """ServiceNow MCP with per-session package selection and call guard."""

    def __init__(self, config: ServerConfig, *, context_present: bool, tool_package: str):
        self._gateway_context_present = context_present
        self._gateway_tool_package = tool_package
        super().__init__(config)

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
        return await super()._call_tool_impl(name, arguments)


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

