import json
import logging
import unittest
from unittest.mock import AsyncMock, patch
from mcp import types
from servicenow_mcp_gateway.diagnostics import remote_failure_message, SafeJsonFormatter
from servicenow_mcp_gateway.gateway import GatewayServiceNowMCP
from servicenow_mcp_gateway.context import server_config_from_context


class DiagnosticsTest(unittest.IsolatedAsyncioTestCase):
    async def test_upstream_401_is_actionable_and_does_not_disclose_remote_payload(self):
        server = GatewayServiceNowMCP(server_config_from_context(None), context_present=True, tool_package="full", diagnostics={"diagnosticId": "reference-1"})
        result = [types.TextContent(type="text", text=json.dumps({"success": False, "message": "401 Client Error: Unauthorized for url: https://example.service-now.com?password=secret"}))]
        with patch("servicenow_mcp.server.ServiceNowMCP._call_tool_impl", new=AsyncMock(return_value=result)):
            with self.assertLogs("servicenow_mcp_gateway", level="ERROR") as logs:
                with self.assertRaisesRegex(RuntimeError, "SERVICENOW_AUTHENTICATION_FAILED: HTTP 401") as caught:
                    await server._call_tool_impl("list_incidents", {"limit": 3})
            self.assertNotIn("secret", str(caught.exception))
            self.assertEqual(logs.records[0].diagnostics["diagnosticId"], "reference-1")

    def test_remote_statuses_are_distinguished_without_echoing_payloads(self):
        for status, code in [(403, "ACCESS_DENIED"), (404, "NOT_FOUND"), (429, "RATE_LIMITED"), (503, "UNAVAILABLE")]:
            self.assertIn(code, remote_failure_message({"error": f"{status} private-data"}))
            self.assertNotIn("private-data", remote_failure_message({"error": f"{status} private-data"}))

    def test_structured_formatter_redacts_remote_query_and_auth(self):
        record = logging.LogRecord("test", logging.ERROR, "", 0, "https://example.com/path?token=private Authorization: Bearer secret", (), None)
        record.diagnostics = {"diagnosticId": "ref"}
        parsed = json.loads(SafeJsonFormatter().format(record))
        self.assertEqual(parsed["diagnosticId"], "ref")
        self.assertNotIn("private", parsed["msg"])
        self.assertNotIn("secret", parsed["msg"])
