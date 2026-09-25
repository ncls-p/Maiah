import { z } from "zod";
import { tableNames } from "./registry";
import { INSTANCE_TARGET_REQUIRED } from "./target";

// Only these server-authored messages may cross the HTTP boundary. Storage/SQL/crypto
// exceptions can contain connection information or arbitrary archive content.
const safeMessages = new Set([
  "Pause writers/workers and set DATA_PORTABILITY_MAINTENANCE=true before migrating data",
  "Legacy local code-workspace files must be migrated into object storage before export",
  "Incorrect passphrase or damaged archive",
  "Invalid archive or archive size limit exceeded",
  "Archive exceeds the 128 MiB safety limit; nothing was truncated",
  "Upload limit exceeded",
  "Database export exceeds the archive safety limit",
  "Export exceeds the 100,000 row safety limit; nothing was truncated",
  "Objects exceed archive safety limit; nothing was truncated",
  "Object inventory limit exceeded",
  "Object size limit exceeded",
  "Referenced object is missing from storage",
  "Storage changed during export; pause writers and retry",
  "Unknown object namespace; organization export cannot prove isolation. Use an instance export",
  "Storage prefixes differ; configure the destination with the archive prefixes before importing",
  "Another portability operation is running",
  "An object already exists on the destination; import aborted without overwriting",
  "Built-in role definitions differ; run the same Maiah version on both instances instead of merging permissions",
  "Initialize a destination platform administrator before importing an organization",
  "Database schema differs from the reviewed portability registry; migrate both instances first",
  "Commit outcome is uncertain; inspect the destination before retrying or cleaning objects",
  "Import failed; staging objects require operator cleanup",
  "Administrator session was revoked, expired or impersonated",
  "Unsupported request format",
  "Invalid request body",
  "Invalid object metadata; export aborted without omissions",
  "Object metadata has no workspace owner",
  "Object metadata references a file outside its owner directory",
  "Stored files without owner metadata; organization export cannot prove isolation. Use an instance export",
  "Archive contains rows outside its organization scope",
  "Archive contains objects outside its organization scope",
]);
// Destination state, not archive validity: the operator must clean the target.
const conflictMessages = new Set([
  "Archive references existing destination data it does not contain; import refused",
  INSTANCE_TARGET_REQUIRED,
]);
export function publicPortabilityError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") {
    // Only a registry table name is reported: never constraint details or values.
    const table = (error as { table?: unknown }).table;
    const where = tableNames.some((name) => name === table)
      ? ` in ${table}`
      : "";
    return {
      status: 409,
      message: `Destination conflict${where}: existing identities or resources must not be overwritten. Use a clean target.`,
    };
  }
  if (error instanceof Error && conflictMessages.has(error.message))
    return { status: 409, message: error.message };
  // Platform administrators only: naming the conflicting accounts is what makes the target fixable.
  if (
    error instanceof Error &&
    /^An archived user already exists on the destination with the same email \([^()]{1,1600}\); identities are never merged$/.test(
      error.message,
    )
  )
    return { status: 409, message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: 400,
      message: "Archive format, schema or request is invalid",
    };
  if (error instanceof Error && safeMessages.has(error.message))
    return {
      status: error.message.startsWith("Administrator session") ? 403 : 400,
      message: error.message,
    };
  if (
    error instanceof Error &&
    /^Cross-organization dependency in [a-z_]+; use an instance export instead$/.test(
      error.message,
    )
  )
    return {
      status: 409,
      message:
        "This organization depends on another organization. Use an instance export to preserve the complete dependency graph.",
    };
  return {
    status: 400,
    message:
      "Migration validation failed. Check the archive, source keys, schema and storage connectivity; no database changes were committed.",
  };
}
