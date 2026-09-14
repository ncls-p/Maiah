"""Session-bound REST calls; never retry mutations or follow credential-bearing redirects."""
from typing import Any

import requests


class ServiceNowRest:
    def __init__(self, config, auth_manager):
        self.base_url = str(config.instance_url).rstrip("/")
        self.auth = auth_manager

    def request(self, method: str, path: str, *, params=None, body=None) -> Any:
        mutation = method != "GET"
        uncertain = (
            " The write outcome may be unknown. Check ServiceNow before retrying; "
            "do not automatically resubmit."
            if mutation else ""
        )
        try:
            response = requests.request(
                method,
                self.base_url + path,
                headers=self.auth.get_headers(),
                params=params,
                json=body,
                timeout=(10, 60),
                allow_redirects=False,
            )
        except requests.RequestException:
            raise RuntimeError("ServiceNow request failed or timed out." + uncertain) from None
        if not 200 <= response.status_code < 300:
            # Do not echo headers, submitted values, or upstream HTML into logs/errors.
            raise RuntimeError(
                f"ServiceNow HTTP {response.status_code}. Check access rights and submitted "
                "field values."
                + (uncertain if response.status_code >= 500 else "")
            )
        try:
            payload = response.json()
        except ValueError:
            raise RuntimeError("ServiceNow returned invalid JSON." + uncertain) from None
        if not isinstance(payload, dict) or "result" not in payload or "error" in payload:
            raise RuntimeError("ServiceNow returned an unexpected response." + uncertain)
        return payload["result"]

    def rows(self, table: str, query: str, fields: str, *, limit=100, offset=0):
        result = self.request("GET", f"/api/now/table/{table}", params={
            "sysparm_query": query,
            "sysparm_fields": fields,
            "sysparm_limit": limit,
            "sysparm_offset": offset,
            "sysparm_exclude_reference_link": "true",
            "sysparm_display_value": "false",
        })
        if not isinstance(result, list):
            raise RuntimeError("ServiceNow returned an invalid record list")
        return result

    def metadata_rows(self, table: str, query: str, fields: str):
        rows = []
        for offset in range(0, 10000, 100):
            page = self.rows(table, query + "^ORDERBYsys_id", fields, offset=offset)
            rows.extend(page)
            if len(page) < 100:
                return rows
        raise RuntimeError("Form metadata exceeds the supported size; refusing partial metadata")


def query_text(text: str) -> str:
    # Encoded-query separators are not plain search text.
    if "^" in text or "javascript:" in text.lower():
        raise ValueError("Search text cannot contain encoded queries or JavaScript")
    return text


def value(raw):
    return raw.get("value") if isinstance(raw, dict) else raw


def is_true(raw):
    return str(value(raw)).lower() == "true"
