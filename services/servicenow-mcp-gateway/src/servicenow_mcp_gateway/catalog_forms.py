"""Customer catalog discovery, form preparation and actual Service Catalog submissions."""
import json

from .rest_client import is_true

CATALOG_API = "/api/sn_sc/servicecatalog"
FORM_LIMITS = (
    "Static metadata checks only. Browser client scripts, UI policies and dynamic reference "
    "qualifiers are not executed. ServiceNow performs final server-side validation. "
    "Use the ServiceNow portal for browser-only controls or attachment uploads."
)


def search_catalogs(client, args):
    return client.request("GET", CATALOG_API + "/catalogs", params={
        "sysparm_text": args.text, "sysparm_limit": args.limit, "sysparm_offset": args.offset,
    })


def search_items(client, args, *, forms_only=False):
    params = {
        "sysparm_text": args.text, "sysparm_limit": args.limit, "sysparm_offset": args.offset,
    }
    if args.catalog_id:
        params["sysparm_catalog"] = args.catalog_id
    if args.category_id:
        params["sysparm_category"] = args.category_id
    if forms_only:
        params["sysparm_type"] = "Record Producer"
    return client.request("GET", CATALOG_API + "/items", params=params)


def get_catalog_form(client, args):
    item = client.request("GET", f"{CATALOG_API}/items/{args.item_id}")
    if not isinstance(item, dict) or "variables" not in item:
        raise RuntimeError("ServiceNow did not return the catalog form variables")
    return {"item": item, "validation_limits": FORM_LIMITS}


def variable_fields(variables):
    if isinstance(variables, dict):
        variables = list(variables.values())
    if not isinstance(variables, list):
        raise RuntimeError("Unsupported catalog variable metadata")
    for variable in variables:
        if not isinstance(variable, dict):
            raise RuntimeError("Unsupported catalog variable metadata")
        # A multi-row variable set is submitted as one value; its rows are not top-level fields.
        if variable.get("name"):
            yield variable
        if variable.get("variables") and not is_true(variable.get("multi_row")):
            yield from variable_fields(variable["variables"])


def prepare_catalog_form(client, args):
    form = get_catalog_form(client, args)
    fields = {field["name"]: field for field in variable_fields(form["item"]["variables"])}
    variables = dict(args.variables)
    errors = [{"field": name, "error": "unknown_variable"} for name in variables if name not in fields]
    for name, field in fields.items():
        supplied = variables.get(name)
        if name not in variables:
            default = field.get("value", field.get("default_value"))
            if default not in (None, "") and not str(default).lower().startswith("javascript:"):
                variables[name] = supplied = default
        if is_true(field.get("mandatory")) and supplied in (None, "", []):
            errors.append({"field": name, "error": "required"})
        choices = field.get("choices")
        if supplied not in (None, "") and isinstance(choices, list) and choices:
            allowed = {str(choice["value"]) for choice in choices if "value" in choice}
            if allowed and str(supplied) not in allowed:
                errors.append({"field": name, "error": "invalid_choice", "allowed_values": sorted(allowed)})
        if isinstance(supplied, (list, dict)):
            variables[name] = json.dumps(supplied)
        elif isinstance(supplied, bool):
            variables[name] = str(supplied).lower()
    return {
        **form, "variables": variables, "errors": errors,
        "passes_static_checks": not errors, "submitted": False,
    }


def submit_catalog_form(client, args, action):
    prepared = prepare_catalog_form(client, args)
    if prepared["errors"]:
        return prepared
    item = prepared["item"]
    item_type = item.get("type")
    producer = item_type == "record_producer" or item.get("sys_class_name") == "sc_cat_item_producer"
    if action == "submit_producer":
        if not producer:
            raise ValueError("This is not a record producer. Use order_catalog_item for catalog items.")
    elif producer or item_type != "catalog_item":
        raise ValueError("Only catalog items can be ordered here. Use submit_catalog_form for "
                         "record producers; order guides and content items require the portal.")
    body = {"variables": prepared["variables"]}
    if action != "submit_producer":
        body["sysparm_quantity"] = args.quantity
        if args.requested_for:
            body["sysparm_requested_for"] = args.requested_for
    result = client.request("POST", f"{CATALOG_API}/items/{args.item_id}/{action}", body=body)
    return {"result": result, "action": action, "validation_limits": FORM_LIMITS}
