"""MCP tool definitions for discovering and submitting ServiceNow forms."""
from dataclasses import dataclass
from functools import partial
from typing import Callable

from pydantic import BaseModel

from . import catalog_forms as catalog
from . import record_forms as records
from .form_models import (
    CatalogForm, CatalogOrder, CatalogSearch, Checkout, Input, Item,
    RecordForm, RecordSearch, RecordValues, Search, ServiceRequest,
)
from .service_requests import get_service_request, search_service_requests


@dataclass(frozen=True)
class FormTool:
    model: type[BaseModel]
    description: str
    execute: Callable
    writes: bool = False


def get_cart(client, _args):
    return client.request("GET", catalog.CATALOG_API + "/cart")


def checkout_cart(client, args):
    return client.request("POST", f"{catalog.CATALOG_API}/cart/{args.step}", body={})


FORM_TOOLS = {
    "search_service_requests": FormTool(Search,
        "Search ServiceNow requests (REQ) by number or description. Requests are created by "
        "order_catalog_item or checkout_catalog_cart, not by manually inserting request rows.",
        search_service_requests),
    "get_service_request": FormTool(ServiceRequest,
        "Read a ServiceNow request (REQ) and all associated requested items (RITM), including "
        "state, approval and fulfillment stage. Use request_id returned by catalog ordering.",
        get_service_request),
    "search_catalogs": FormTool(Search,
        "Search available ServiceNow catalogs by title; empty text browses catalogs visible to the user.",
        catalog.search_catalogs),
    "search_catalog_items": FormTool(CatalogSearch,
        "Find products/services available to order, with catalog/category filters and pagination. "
        "Results also include producers and guides: inspect type and get_catalog_form before ordering.",
        catalog.search_items),
    "search_catalog_forms": FormTool(CatalogSearch,
        "Search request forms (record producers) by text in all or selected catalogs. "
        "For product order forms use search_catalog_items; for table/custom forms use search_record_forms.",
        partial(catalog.search_items, forms_only=True)),
    "get_catalog_form": FormTool(Item,
        "Read a catalog item or record producer form: variable names, types, choices, required fields, "
        "defaults, reference metadata, price and client rules. Read before filling. Scripts are not executed.",
        catalog.get_catalog_form),
    "prepare_catalog_form": FormTool(CatalogForm,
        "Fill a catalog form without submitting: return proposed variables and static validation errors. "
        "Collect missing required answers; never invent references or choices. Does not guarantee server acceptance.",
        catalog.prepare_catalog_form),
    "order_catalog_item": FormTool(CatalogOrder,
        "WRITE: Place an actual order for one catalog item with filled variables and quantity. "
        "Use only for a requested purchase, after reading/preparing the form. Returns ServiceNow request IDs. "
        "Never automatically retry after an uncertain outcome; this can duplicate orders.",
        partial(catalog.submit_catalog_form, action="order_now"), True),
    "submit_catalog_form": FormTool(CatalogForm,
        "WRITE: Submit a filled record producer request form and create its target record. "
        "Use order_catalog_item for products. Never automatically retry an uncertain submission.",
        partial(catalog.submit_catalog_form, action="submit_producer"), True),
    "add_catalog_item_to_cart": FormTool(CatalogOrder,
        "WRITE: Add a filled catalog item to the current user's persistent ServiceNow cart. "
        "Does not place the order. Never automatically retry an uncertain addition.",
        partial(catalog.submit_catalog_form, action="add_to_cart"), True),
    "get_catalog_cart": FormTool(Input,
        "Read all items, variables, quantities and totals in the user's current ServiceNow cart.", get_cart),
    "checkout_catalog_cart": FormTool(Checkout,
        "WRITE: Checkout ALL items in the user's current cart, including pre-existing ones. Read the cart "
        "first and ensure the whole cart is intended. Start with checkout; use submit_order only if the "
        "response requires two-step completion. A request ID/number confirms ordering. Never auto-retry.",
        checkout_cart, True),
    "search_record_forms": FormTool(Search,
        "Search ServiceNow table-backed forms by label or technical name, including custom tables. "
        "Requires metadata access. Use search_catalog_forms for catalog request forms.", records.search_record_forms),
    "get_record_form": FormTool(RecordForm,
        "Discover fields for any table-backed form: inherited fields, dictionary overrides, types, "
        "choices, defaults, references and optional current record values. Requires metadata access. "
        "Does not execute browser scripts or UI actions.", records.get_record_form),
    "prepare_record_form": FormTool(RecordValues,
        "Fill any table-backed form without saving. Check supplied fields and return a reviewable "
        "draft with static errors. Omit record_id for creation, provide it for a partial update.",
        records.prepare_record_form),
    "submit_record_form": FormTool(RecordValues,
        "WRITE: Submit fields to create or partially update a ServiceNow record (including custom tables). "
        "Use get_record_form/prepare_record_form first. ACLs and server rules apply. Use catalog tools for "
        "orders and producers, never insert request tables to simulate an order. Never auto-retry.",
        records.submit_record_form, True),
    "search_form_records": FormTool(RecordSearch,
        "Find existing records or resolve reference choices in a form's referenced table. Search by a "
        "specified field (e.g. name or number); returns sys_ids and requested columns. Check qualifiers "
        "from form metadata; this lookup does not evaluate dynamic reference qualifiers.", records.search_form_records),
}
