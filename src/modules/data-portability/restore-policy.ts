import type { Snapshot } from "./archive";
import type { Dataset } from "./registry";

/** Preserve the original state in the archive, never resume foreign leases or jobs. */
export function pauseRestoredData(data: Dataset, scope: Snapshot["scope"]) {
  const expired = "1970-01-01T00:00:00+00:00";
  for (const table of [
    "session",
    "verification",
    "mcp_oauth_attempts",
    "workspace_invitations",
    "custom_tool_secret_requests",
    "workflow_agent_input_requests",
    "workflow_agent_run_requests",
  ] as const)
    for (const row of data[table]) row.expires_at = expired;
  for (const table of [
    "ai_providers",
    "mcp_servers",
    "tool_connectors",
    "genesys_connections",
    "scheduled_tasks",
    "user_tool_settings",
  ] as const)
    for (const row of data[table]) row.enabled = false;
  for (const row of data.tool_connections) row.status = "disabled";
  for (const row of data.workflows)
    if (row.status === "active") row.status = "draft";
  for (const row of data.messages) {
    if (["pending", "streaming"].includes(String(row.status)))
      row.status = "cancelled";
    row.stream_generation_id = null;
    row.stream_lease_expires_at = null;
  }
  for (const row of data.agent_runs) {
    if (["queued", "running", "waiting_approval"].includes(String(row.status)))
      row.status = "cancelled";
    row.lease_owner = null;
    row.lease_expires_at = null;
  }
  for (const row of data.workflow_runs)
    if (["queued", "running"].includes(String(row.status)))
      row.status = "cancelled";
  for (const row of data.workflow_run_steps)
    if (["pending", "running"].includes(String(row.status)))
      row.status = "skipped";
  for (const row of data.agent_run_steps)
    if (["queued", "running", "waiting_approval"].includes(String(row.status)))
      row.status = "cancelled";
  for (const row of data.workspace_token_reservations) {
    if (row.status === "active") row.status = "expired";
    row.expires_at = expired;
  }
  for (const row of data.usage_limit_charges)
    if (row.status === "reserved") row.status = "released";
  for (const row of data.mcp_sync_state) {
    row.lease_id = null;
    row.lease_until = null;
  }
  for (const row of data.genesys_deliveries)
    if (["queued", "sending"].includes(String(row.state))) row.state = "failed";
  for (const row of data.app_settings) {
    if (
      String(row.key).startsWith("microsoft-sso:") &&
      row.value_json &&
      typeof row.value_json === "object"
    ) {
      const config = row.value_json as Record<string, unknown>;
      config.enabled = false;
      config.approved = false;
    }
  }
  // An org archive must never promote users into platform administrators.
  if (scope.type === "organization")
    for (const row of data.user) row.role = null;
}
