"""Safe operation diagnostics: no arguments, credentials or remote response bodies."""
import logging
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit


def safe_url(match):
    try:
        url = urlsplit(match.group(0))
        return f"{url.scheme}://{url.hostname}{url.path}"
    except ValueError:
        return "[URL]"


def remote_failure_message(payload):
    # The upstream SDK flattens requests.HTTPError into its message field.
    message = str(payload.get("message", "")) + " " + str(payload.get("error", ""))
    match = re.search(r"\b(401|403|404|429|5\d\d)\b", message)
    status = match.group(1) if match else None
    if status == "401":
        return "SERVICENOW_AUTHENTICATION_FAILED: HTTP 401. Check this connection's credentials and the instance REST authentication policy. Do not retry until the connection is corrected."
    if status == "403":
        return "SERVICENOW_ACCESS_DENIED: HTTP 403. Ask the instance administrator to check REST access and the table, record and field ACLs. Do not retry unchanged."
    if status == "404":
        return "SERVICENOW_NOT_FOUND: HTTP 404. Check the instance, endpoint and record."
    if status == "429":
        return "SERVICENOW_RATE_LIMITED: HTTP 429. Wait before retrying."
    if status:
        return f"SERVICENOW_UNAVAILABLE: HTTP {status}. The remote instance failed to process the operation."
    return "SERVICENOW_OPERATION_FAILED: The remote operation failed. Check the gateway diagnostic reference."


class SafeJsonFormatter(logging.Formatter):
    def format(self, record):
        message = record.getMessage()
        message = re.sub(r"https?://[^\s\"'<>]+", safe_url, message)
        message = re.sub(r"(?i)\b(Bearer|Basic)\s+\S+", r"\1 [REDACTED]", message)
        message = re.sub(r'''(?i)((?:password|secret|token|authorization|cookie|api[_-]?key)["']?\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')''', r"\1[REDACTED]", message)
        message = re.sub(r"(?i)((?:password|secret|token|authorization|cookie|api[_-]?key)\s*[=:]\s*)\S+", r"\1[REDACTED]", message)
        return json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "lvl": record.levelname.lower(),
                           "service": "servicenow-mcp-gateway", "msg": message[:2000],
                           **getattr(record, "diagnostics", {})})
