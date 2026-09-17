import json
import unittest
from unittest.mock import Mock, patch

from servicenow_mcp_gateway.context import server_config_from_context
from servicenow_mcp_gateway.gateway import GatewayServiceNowMCP

ITEM = "a" * 32
RECORD = "b" * 32
PARENT = "c" * 32


def response(result):
    return Mock(status_code=200, json=Mock(return_value={"result": result}))


class RecordFormsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.server = GatewayServiceNowMCP(server_config_from_context(None),
                                          context_present=True, tool_package="full")
        self.patch = patch("servicenow_mcp_gateway.rest_client.requests.request")
        self.http = self.patch.start()
        self.addCleanup(self.patch.stop)
        self.http.side_effect = self.endpoint

    def endpoint(self, method, url, **kwargs):
        query = (kwargs.get("params") or {}).get("sysparm_query", "")
        if method in ("POST", "PATCH"):
            return response({"sys_id": RECORD, **kwargs["json"]})
        if url.endswith("/sys_db_object"):
            return response([{"sys_id": ITEM, "name": "u_request", "label": "Custom request",
                              "super_class": PARENT}])
        if url.endswith("/sys_db_object/" + PARENT):
            return response({"sys_id": PARENT, "name": "task", "super_class": ""})
        if url.endswith("/sys_dictionary"):
            if query.startswith("name=task^"):
                return response([{"element": "short_description", "mandatory": "false"},
                                 {"element": "state", "choice": "1"},
                                 {"element": "sys_id", "read_only": "true"},
                                 {"element": "assigned_to", "reference": "sys_user"}])
            return response([{"element": "u_reason", "mandatory": "true", "default_value": "general"}])
        if url.endswith("/sys_dictionary_override"):
            return response([{"element": "short_description", "override_mandatory": "true", "mandatory": "true"}]
                            if query.startswith("name=u_request^") else [])
        if url.endswith("/sys_choice"):
            return response([{"element": "state", "value": "1", "label": "Open"}]
                            if query.startswith("name=task^") else [])
        if url.endswith("/u_request/" + RECORD):
            return response({"sys_id": RECORD, "short_description": {"value": "Existing", "display_value": "Existing"}})
        raise AssertionError((method, url, kwargs))

    async def call(self, name, **args):
        result = await self.server._call_tool_impl(name, args)
        return json.loads(result[0].text)

    async def test_search_read_prepare_and_create_custom_form(self):
        found = await self.call("search_record_forms", text="Custom")
        self.assertEqual(found["forms"][0]["name"], "u_request")
        form = await self.call("get_record_form", table="u_request")
        fields = {field["element"]: field for field in form["fields"]}
        self.assertEqual(fields["short_description"]["mandatory"], "true")
        self.assertEqual(fields["assigned_to"]["reference"], "sys_user")
        self.assertEqual(fields["state"]["choices"][0]["value"], "1")
        draft = await self.call("prepare_record_form", table="u_request", values={"short_description": "Help"})
        self.assertTrue(draft["passes_static_checks"])
        self.assertTrue(all(call.args[0] == "GET" for call in self.http.call_args_list))
        result = await self.call("submit_record_form", table="u_request", values={"short_description": "Help", "state": "1"})
        self.assertEqual(result["operation"], "create")
        self.assertEqual(self.http.call_args.args[0], "POST")

    async def test_update_only_sends_supplied_values_and_honors_display_mode(self):
        result = await self.call("submit_record_form", table="u_request", record_id=RECORD,
                                 values={"state": "Open"}, input_display_values=True)
        self.assertEqual(result["operation"], "update")
        self.assertEqual(self.http.call_args.args[0], "PATCH")
        self.assertEqual(self.http.call_args.kwargs["json"], {"state": "Open"})
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_input_display_value"], "true")

    async def test_required_unknown_read_only_and_invalid_choice_block_writes(self):
        with self.assertRaisesRegex(ValueError, "Form validation failed") as error:
            await self.call("submit_record_form", table="u_request",
                            values={"state": "bad", "sys_id": RECORD, "invented": "x"})
        errors = json.loads(str(error.exception).split(": ", 1)[1])
        self.assertEqual({item["error"] for item in errors},
                         {"invalid_choice", "read_only", "unknown_field", "required"})
        self.assertTrue(all(call.args[0] == "GET" for call in self.http.call_args_list))

    async def test_metadata_access_failure_prevents_submission(self):
        self.http.side_effect = None
        self.http.return_value = response([])
        with self.assertRaisesRegex(RuntimeError, "inaccessible"):
            await self.call("submit_record_form", table="u_request", values={"short_description": "Help"})
        self.assertEqual(self.http.call_count, 1)

    async def test_reference_lookup_is_paginated(self):
        self.http.side_effect = None
        self.http.return_value = response([{"sys_id": RECORD, "name": "Ada"}])
        result = await self.call("search_form_records", table="sys_user", text="Ada", offset=25)
        self.assertEqual(result[0]["sys_id"], RECORD)
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_offset"], 25)
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_query"], "nameLIKEAda^ORDERBYsys_id")

    async def test_requests_and_requested_items(self):
        self.http.side_effect = [response([{"sys_id": RECORD, "number": "REQ00001"}]),
                                 response({"sys_id": RECORD, "number": "REQ00001"}),
                                 response([{"number": "RITM00001", "request": RECORD, "stage": "fulfillment"}])]
        await self.call("search_service_requests", text="REQ00001")
        result = await self.call("get_service_request", request_id=RECORD)
        self.assertEqual(result["requested_items"][0]["number"], "RITM00001")
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_query"], f"request={RECORD}^ORDERBYsys_id")

    async def test_upstream_incident_create_and_read_remain_available(self):
        tools = {tool.name for tool in await self.server._list_tools_impl()}
        self.assertTrue({"create_incident", "list_incidents", "get_incident_by_number", "update_incident"} <= tools)
        incident = {"sys_id": RECORD, "number": "INC00001", "short_description": "Cannot log in"}
        with patch("requests.post", return_value=response(incident)) as post:
            created = await self.call("create_incident", short_description="Cannot log in")
            self.assertTrue(created["success"])
            self.assertEqual(created["incident_number"], "INC00001")
            self.assertTrue(post.call_args.args[0].endswith("/api/now/table/incident"))
        with patch("requests.get", return_value=response([incident])):
            listed = await self.call("list_incidents")
            self.assertEqual(listed["incidents"][0]["number"], "INC00001")

    async def test_upstream_account_creation_update_and_deactivation(self):
        for package in ("full", "service_desk"):
            server = GatewayServiceNowMCP(server_config_from_context(None), context_present=True, tool_package=package)
            names = {tool.name for tool in await server._list_tools_impl()}
            self.assertTrue({"create_user", "update_user", "get_user", "list_users"} <= names)
        user = {"sys_id": RECORD, "user_name": "ada.lovelace"}
        with patch("requests.post", return_value=response(user)) as post:
            created = await self.call("create_user", user_name="ada.lovelace", first_name="Ada", last_name="Lovelace", email="ada@example.test")
            self.assertTrue(created["success"])
            self.assertEqual(created["user_id"], RECORD)
            self.assertTrue(post.call_args.args[0].endswith("/api/now/table/sys_user"))
        with patch("requests.patch", return_value=response(user)) as patch_user:
            updated = await self.call("update_user", user_id=RECORD, email="ada.new@example.test", active=False)
            self.assertTrue(updated["success"])
            self.assertEqual(patch_user.call_args.kwargs["json"], {"email": "ada.new@example.test", "active": "false"})
            self.assertTrue(patch_user.call_args.args[0].endswith("/sys_user/" + RECORD))

    async def test_account_permission_error_is_not_reported_as_success(self):
        import requests
        with patch("requests.patch", side_effect=requests.HTTPError("403 Forbidden")):
            with self.assertRaisesRegex(RuntimeError, "SERVICENOW_ACCESS_DENIED: HTTP 403"):
                await self.call("update_user", user_id=RECORD, active=False)

    async def test_custom_user_fields_through_discovered_form(self):
        def user_endpoint(method, url, **kwargs):
            if method in ("POST", "PATCH"):
                return response({"sys_id": RECORD, **kwargs["json"]})
            if url.endswith("/sys_db_object"):
                return response([{"sys_id": ITEM, "name": "sys_user", "label": "User", "super_class": ""}])
            if url.endswith("/sys_dictionary"):
                return response([{"element": "user_name", "mandatory": "true"}, {"element": "u_employee_id"}, {"element": "active", "internal_type": "boolean"}])
            if url.endswith("/sys_user/" + RECORD):
                return response({"sys_id": RECORD, "user_name": "ada"})
            return response([])
        self.http.side_effect = user_endpoint
        created = await self.call("submit_record_form", table="sys_user", values={"user_name": "ada", "u_employee_id": "E123"})
        self.assertEqual(created["operation"], "create")
        updated = await self.call("submit_record_form", table="sys_user", record_id=RECORD, values={"u_employee_id": "E124", "active": False})
        self.assertEqual(updated["operation"], "update")
        self.assertEqual(self.http.call_args.kwargs["json"], {"u_employee_id": "E124", "active": False})

    async def test_sessions_do_not_share_credentials(self):
        self.http.side_effect = None
        self.http.return_value = response([])
        for username in ("alice", "bob"):
            config = server_config_from_context(None)
            config.auth.basic.username = username
            server = GatewayServiceNowMCP(config, context_present=True, tool_package="full")
            await server._call_tool_impl("search_catalogs", {})
        headers = [call.kwargs["headers"]["Authorization"] for call in self.http.call_args_list]
        self.assertNotEqual(headers[0], headers[1])

    def test_metadata_pagination(self):
        self.http.side_effect = [response([{"element": f"field_{i}"} for i in range(100)]),
                                 response([{"element": "last"}])]
        rows = self.server._form_client.metadata_rows("sys_dictionary", "name=task", "element")
        self.assertEqual(len(rows), 101)
        self.assertEqual(self.http.call_args.kwargs["params"]["sysparm_offset"], 100)


if __name__ == "__main__":
    unittest.main()
