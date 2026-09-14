"""Contract tests through the real upstream MCP server and mocked ServiceNow HTTP."""
import json
import unittest
from unittest.mock import Mock, patch

import requests

from servicenow_mcp_gateway.context import server_config_from_context
from servicenow_mcp_gateway.form_tools import FORM_TOOLS
from servicenow_mcp_gateway.gateway import GatewayServiceNowMCP

ITEM = "a" * 32
RECORD = "b" * 32
PARENT = "c" * 32


def response(result, status=200):
    return Mock(status_code=status, json=Mock(return_value={"result": result}))


def catalog_item(kind="catalog_item"):
    return {"sys_id": ITEM, "type": kind, "name": "Laptop",
            "variables": [{"name": "reason", "mandatory": True},
                          {"name": "size", "choices": [{"value": "small", "label": "Small"}]}]}


class FormToolsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.server = GatewayServiceNowMCP(server_config_from_context(None),
                                          context_present=True, tool_package="full")
        self.patch = patch("servicenow_mcp_gateway.rest_client.requests.request")
        self.http = self.patch.start()
        self.addCleanup(self.patch.stop)

    async def call(self, name, **args):
        content = await self.server._call_tool_impl(name, args)
        return json.loads(content[0].text)

    async def test_tool_discovery_packages_and_write_annotations(self):
        for package in ("full", "service_desk", "catalog_builder"):
            server = GatewayServiceNowMCP(server_config_from_context(None),
                                         context_present=False, tool_package=package)
            tools = {tool.name: tool.model_dump() for tool in await server._list_tools_impl()}
            self.assertTrue(FORM_TOOLS.keys() <= tools.keys())
            for name, definition in FORM_TOOLS.items():
                self.assertEqual(tools[name]["annotations"]["readOnlyHint"], not definition.writes)
                self.assertEqual(tools[name]["inputSchema"]["additionalProperties"], False)
        for package in ("none", "invalid", "knowledge_author"):
            server = GatewayServiceNowMCP(server_config_from_context(None),
                                         context_present=True, tool_package=package)
            self.assertFalse(FORM_TOOLS.keys() & {tool.name for tool in await server._list_tools_impl()})
            with self.assertRaisesRegex(ValueError, "not enabled"):
                await server._call_tool_impl("order_catalog_item", {"item_id": ITEM, "variables": {}})
        self.http.assert_not_called()

    async def test_missing_context_prevents_every_extension_call(self):
        self.server._gateway_context_present = False
        for name in FORM_TOOLS:
            with self.assertRaisesRegex(RuntimeError, "Missing Maiah"):
                await self.call(name)
        self.http.assert_not_called()

    async def test_catalog_search_to_order(self):
        self.http.side_effect = [response([{"sys_id": ITEM}]), response([catalog_item()]),
                                 response(catalog_item()), response(catalog_item()),
                                 response({"request_id": RECORD, "request_number": "REQ00001"})]
        self.assertEqual(await self.call("search_catalogs", text="IT"), [{"sys_id": ITEM}])
        await self.call("search_catalog_items", text="laptop", catalog_id=ITEM, limit=10, offset=20)
        params = self.http.call_args.kwargs["params"]
        self.assertEqual(params, {"sysparm_text": "laptop", "sysparm_catalog": ITEM,
                                  "sysparm_limit": 10, "sysparm_offset": 20})
        draft = await self.call("prepare_catalog_form", item_id=ITEM, variables={"reason": "Work"})
        self.assertFalse(draft["submitted"])
        order = await self.call("order_catalog_item", item_id=ITEM,
                                variables={"reason": "Work", "size": "small"}, quantity=2,
                                requested_for=RECORD)
        self.assertEqual(order["result"]["request_number"], "REQ00001")
        self.assertEqual(self.http.call_args.args, ("POST", self.server._form_client.base_url +
                                                   f"/api/sn_sc/servicecatalog/items/{ITEM}/order_now"))
        self.assertEqual(self.http.call_args.kwargs["json"],
                         {"variables": {"reason": "Work", "size": "small"},
                          "sysparm_quantity": 2, "sysparm_requested_for": RECORD})

    async def test_producer_search_and_submission(self):
        self.http.side_effect = [response([]), response(catalog_item("record_producer")),
                                 response({"sys_id": RECORD, "table": "incident"})]
        await self.call("search_catalog_forms", text="access", category_id=ITEM)
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_type"], "Record Producer")
        result = await self.call("submit_catalog_form", item_id=ITEM, variables={"reason": "Access"})
        self.assertEqual(result["result"]["table"], "incident")
        self.assertTrue(self.http.call_args.args[1].endswith("/submit_producer"))
        self.assertNotIn("sysparm_quantity", self.http.call_args.kwargs["json"])

    async def test_invalid_forms_do_not_write(self):
        self.http.return_value = response(catalog_item())
        with self.assertRaisesRegex(ValueError, "Form validation failed") as error:
            await self.call("order_catalog_item", item_id=ITEM,
                            variables={"size": "not-a-choice", "invented": "value"})
        errors = json.loads(str(error.exception).split(": ", 1)[1])
        self.assertEqual({item["error"] for item in errors},
                         {"required", "invalid_choice", "unknown_variable"})
        self.assertEqual(self.http.call_count, 1)
        self.assertEqual(self.http.call_args.args[0], "GET")

    async def test_wrong_catalog_type_does_not_write(self):
        for kind in ("record_producer", "order_guide", "content_item"):
            self.http.return_value = response(catalog_item(kind))
            with self.assertRaises(ValueError):
                await self.call("order_catalog_item", item_id=ITEM, variables={"reason": "Work"})
            self.assertEqual(self.http.call_args.args[0], "GET")
        self.http.return_value = response(catalog_item())
        with self.assertRaises(ValueError):
            await self.call("submit_catalog_form", item_id=ITEM, variables={"reason": "Work"})

    async def test_nested_and_multi_row_variables(self):
        self.http.return_value = response({"type": "catalog_item", "variables": [
            {"variables": [{"name": "enabled", "mandatory": "true"}]},
            {"name": "people", "multi_row": True, "variables": [{"name": "person"}]},
        ]})
        draft = await self.call("prepare_catalog_form", item_id=ITEM,
                                variables={"enabled": False, "people": [{"person": RECORD}]})
        self.assertEqual(draft["variables"]["enabled"], "false")
        self.assertEqual(json.loads(draft["variables"]["people"]), [{"person": RECORD}])
        self.assertEqual(draft["errors"], [])

    async def test_cart_steps_preserve_two_step_response(self):
        self.http.side_effect = [response(catalog_item()), response({"cart_id": RECORD}),
                                 response({"items": [{"item_id": ITEM}]}),
                                 response({"checkout_required": True}),
                                 response({"request_number": "REQ00002"})]
        await self.call("add_catalog_item_to_cart", item_id=ITEM, variables={"reason": "Work"})
        self.assertTrue(self.http.call_args.args[1].endswith("/add_to_cart"))
        await self.call("get_catalog_cart")
        self.assertEqual(await self.call("checkout_catalog_cart"), {"checkout_required": True})
        self.assertEqual(await self.call("checkout_catalog_cart", step="submit_order"),
                         {"request_number": "REQ00002"})
        self.assertEqual(self.http.call_count, 5)

    async def test_invalid_inputs_and_query_injection(self):
        for args in ({"item_id": "../../incident", "variables": {}},
                     {"item_id": ITEM, "variables": {}, "quantity": 0},
                     {"item_id": ITEM, "variables": {}, "quantity": True},
                     {"item_id": ITEM, "variables": {}, "typo": "secret-value"}):
            with self.assertRaises(ValueError) as error:
                await self.call("order_catalog_item", **args)
            self.assertNotIn("secret-value", str(error.exception))
        with self.assertRaises(ValueError):
            await self.call("search_record_forms", text="x^NQactive=true")
        with self.assertRaises(ValueError):
            await self.call("get_record_form", table="incident/../../sys_user")
        self.http.assert_not_called()

    async def test_http_errors_redirects_and_no_retry(self):
        for status in (302, 400, 401, 403, 404, 429, 500):
            self.http.return_value = response({}, status)
            with self.assertRaisesRegex(RuntimeError, f"HTTP {status}"):
                await self.call("search_catalogs")
            self.assertFalse(self.http.call_args.kwargs["allow_redirects"])
            self.assertEqual(self.http.call_args.kwargs["timeout"], (10, 60))
        self.http.reset_mock()
        self.http.side_effect = requests.Timeout("sensitive request data")
        with self.assertRaisesRegex(RuntimeError, "do not automatically resubmit") as error:
            await self.call("checkout_catalog_cart")
        self.assertNotIn("sensitive", str(error.exception))
        self.assertEqual(self.http.call_count, 1)

    async def test_malformed_or_error_payload_is_not_success(self):
        for payload in ([], {"error": {"message": "failed"}}, {"result": {}, "error": {}}):
            self.http.return_value = Mock(status_code=200, json=Mock(return_value=payload))
            with self.assertRaisesRegex(RuntimeError, "unexpected response"):
                await self.call("checkout_catalog_cart")
        self.http.return_value = Mock(status_code=200, json=Mock(side_effect=ValueError()))
        with self.assertRaisesRegex(RuntimeError, "invalid JSON"):
            await self.call("checkout_catalog_cart")


if __name__ == "__main__":
    unittest.main()
