"""Discover and fill table-backed forms, including custom tables and inherited fields."""
from .form_models import Identifier, SysId
from .rest_client import is_true, query_text, value
from pydantic import TypeAdapter

TABLE_FIELDS = "sys_id,name,label,super_class"
DICTIONARY_FIELDS = (
    "name,element,column_label,internal_type,mandatory,read_only,max_length,"
    "reference,reference_qual,choice,default_value,dependent,attributes"
)
LIMITS = (
    "Dictionary metadata describes record fields, not a browser form layout or field ACLs. "
    "Client scripts, UI actions and UI policies are not executed. ACLs, business rules and "
    "data policies are enforced by ServiceNow. Metadata access requires appropriate roles. "
    "Dynamic defaults are evaluated only by ServiceNow; review saved values after submission."
)


def search_record_forms(client, args):
    text = query_text(args.text)
    query = f"labelLIKE{text}^ORnameLIKE{text}^ORDERBYname" if text else "ORDERBYname"
    return {"forms": client.rows("sys_db_object", query, TABLE_FIELDS,
                                  limit=args.limit, offset=args.offset),
            "limitations": LIMITS}


def table_hierarchy(client, table):
    rows = client.rows("sys_db_object", f"name={table}", TABLE_FIELDS, limit=1)
    if not rows:
        raise RuntimeError("Table not found or form metadata is inaccessible")
    chain = []
    seen = set()
    current = rows[0]
    while current:
        name = TypeAdapter(Identifier).validate_python(value(current.get("name")))
        if name in seen or len(chain) >= 20:
            raise RuntimeError("Invalid or excessively deep table inheritance")
        seen.add(name)
        chain.append({**current, "name": name})
        parent = value(current.get("super_class"))
        if not parent:
            break
        parent = TypeAdapter(SysId).validate_python(parent)
        current = client.request("GET", f"/api/now/table/sys_db_object/{parent}", params={
            "sysparm_fields": TABLE_FIELDS, "sysparm_exclude_reference_link": "true",
            "sysparm_display_value": "false",
        })
    return chain


def get_record_form(client, args):
    hierarchy = table_hierarchy(client, args.table)
    fields = {}
    # Base fields first; child definitions/overrides replace inherited metadata.
    for table in reversed(hierarchy):
        name = table["name"]
        definitions = client.metadata_rows("sys_dictionary", f"name={name}^elementISNOTEMPTY", DICTIONARY_FIELDS)
        for field in definitions:
            element = value(field.get("element"))
            if element:
                fields[element] = {key: value(raw) for key, raw in field.items()}
        overrides = client.metadata_rows(
            "sys_dictionary_override", f"name={name}",
            "element,override_mandatory,mandatory,override_read_only,read_only,"
            "override_default_value,default_value,override_reference_qual,reference_qual",
        )
        for override in overrides:
            field = fields.get(value(override.get("element")))
            if field is not None:
                for prop in ("mandatory", "read_only", "default_value", "reference_qual"):
                    if is_true(override.get(f"override_{prop}")):
                        field[prop] = value(override.get(prop))
        choices = client.metadata_rows(
            "sys_choice", f"name={name}^inactive=false",
            "element,label,value,dependent_value,language,sequence",
        )
        by_field = {}
        for choice in choices:
            by_field.setdefault(value(choice.get("element")), []).append(choice)
        for element, options in by_field.items():
            if element in fields:
                fields[element]["choices"] = options
    if not fields:
        raise RuntimeError("No readable form fields; check dictionary metadata permissions")
    record = None
    if args.record_id:
        record = client.request("GET", f"/api/now/table/{args.table}/{args.record_id}", params={
            "sysparm_display_value": "all", "sysparm_exclude_reference_link": "true",
        })
    return {"table": args.table, "label": hierarchy[0].get("label"),
            "fields": list(fields.values()), "record": record, "limitations": LIMITS}


def prepare_record_form(client, args):
    form = get_record_form(client, args)
    fields = {field["element"]: field for field in form["fields"]}
    errors = []
    for name, supplied in args.values.items():
        field = fields.get(name)
        if field is None:
            errors.append({"field": name, "error": "unknown_field"})
        elif name.startswith("sys_") or is_true(field.get("read_only")):
            errors.append({"field": name, "error": "read_only"})
        elif is_true(field.get("mandatory")) and supplied in (None, ""):
            errors.append({"field": name, "error": "required"})
        elif isinstance(supplied, (dict, list)):
            errors.append({"field": name, "error": "use_scalar_or_encoded_json"})
        elif not args.input_display_values and field.get("choices") and supplied not in (None, ""):
            # Choice=3 permits values outside suggestions. Dependent choices stay in metadata.
            if str(field.get("choice")) != "3":
                allowed = {str(value(choice.get("value"))) for choice in field["choices"]}
                if str(supplied) not in allowed:
                    errors.append({"field": name, "error": "invalid_choice"})
    if not args.record_id:
        for name, field in fields.items():
            if (is_true(field.get("mandatory")) and not is_true(field.get("read_only"))
                    and not name.startswith("sys_") and name not in args.values
                    and not field.get("default_value")):
                errors.append({"field": name, "error": "required"})
    return {**form, "values": args.values, "errors": errors,
            "passes_static_checks": not errors, "submitted": False}


def submit_record_form(client, args):
    prepared = prepare_record_form(client, args)
    if prepared["errors"]:
        return prepared
    path = f"/api/now/table/{args.table}"
    if args.record_id:
        path += f"/{args.record_id}"
    result = client.request("PATCH" if args.record_id else "POST", path, body=args.values, params={
        "sysparm_input_display_value": str(args.input_display_values).lower(),
        "sysparm_display_value": "all", "sysparm_exclude_reference_link": "true",
    })
    return {"result": result, "operation": "update" if args.record_id else "create",
            "limitations": LIMITS}


def search_form_records(client, args):
    text = query_text(args.text)
    query = f"{args.search_field}LIKE{text}^ORDERBYsys_id" if text else "ORDERBYsys_id"
    return client.rows(args.table, query, ",".join(dict.fromkeys(["sys_id", *args.fields])),
                       limit=args.limit, offset=args.offset)
