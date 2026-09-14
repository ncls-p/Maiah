"""Read real catalog requests and their requested items after ordering."""
from .rest_client import query_text

REQUEST_FIELDS = "sys_id,number,short_description,state,request_state,approval,requested_for,opened_by,opened_at"
ITEM_FIELDS = "sys_id,number,request,cat_item,short_description,state,stage,approval,quantity,price,requested_for"


def search_service_requests(client, args):
    text = query_text(args.text)
    query = f"numberLIKE{text}^ORshort_descriptionLIKE{text}^ORDERBYDESCsys_created_on" if text else "ORDERBYDESCsys_created_on"
    return client.rows("sc_request", query, REQUEST_FIELDS, limit=args.limit, offset=args.offset)


def get_service_request(client, args):
    request = client.request("GET", f"/api/now/table/sc_request/{args.request_id}", params={
        "sysparm_fields": REQUEST_FIELDS, "sysparm_display_value": "all",
        "sysparm_exclude_reference_link": "true",
    })
    items = client.metadata_rows("sc_req_item", f"request={args.request_id}", ITEM_FIELDS)
    return {"request": request, "requested_items": items}
