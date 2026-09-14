"""Strict MCP inputs for catalog and arbitrary ServiceNow record forms."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

SysId = Annotated[str, Field(pattern=r"^[0-9a-fA-F]{32}$")]
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$", max_length=160)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)


class Search(Input):
    text: str = Field(default="", max_length=200, description="Search words; empty to browse.")
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class CatalogSearch(Search):
    catalog_id: SysId | None = None
    category_id: SysId | None = None


class Item(Input):
    item_id: SysId


class CatalogForm(Item):
    variables: dict[str, JsonValue] = Field(
        description="Values keyed by variable NAME from get_catalog_form, not label or sys_id. "
        "Use stored choice values and reference sys_ids. Multi-row sets use JSON-encoded arrays."
    )


class CatalogOrder(CatalogForm):
    quantity: int = Field(default=1, ge=1, le=1000)
    requested_for: SysId | None = None


class RecordForm(Input):
    table: Identifier
    record_id: SysId | None = Field(default=None, description="Omit for a new record.")


class RecordValues(RecordForm):
    values: dict[Identifier, JsonValue] = Field(min_length=1)
    input_display_values: bool = Field(
        default=False,
        description="False uses stored choice values, reference sys_ids and UTC dates. "
        "True lets ServiceNow resolve display values (also required for encrypted fields).",
    )


class RecordSearch(Search):
    table: Identifier
    search_field: Identifier = "name"
    fields: list[Identifier] = Field(default_factory=lambda: ["sys_id", "name"], max_length=30)


class Checkout(Input):
    step: Literal["checkout", "submit_order"] = "checkout"


class ServiceRequest(Input):
    request_id: SysId
