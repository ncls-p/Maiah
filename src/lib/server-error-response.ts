import { redactErrorText } from "./error-report";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";

/** Public diagnostics: never serialize the exception, stack, cause or request payload. */
export function serverErrorResponse(error: unknown, requestId: string) {
  const raw = error instanceof Error ? error.message : "Internal server error";
  const databaseError =
    /(?:failed query|\bselect\b.+\bfrom\b|\binsert into\b|\bupdate\b.+\bset\b|\bdelete from\b|constraint|relation .+ does not exist)/i.test(
      raw.replace(/\s+/g, " "),
    );
  const message = databaseError
    ? "Database operation failed"
    : redactErrorText(safeToolErrorMessage(error, "Internal server error"));
  const code = /^BEDROCK_[A-Z_]+$/.test(raw)
    ? raw
    : databaseError
      ? "DATABASE_ERROR"
      : "SERVER_ERROR";
  const reference = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  return {
    error: `${message}\nReference: ${reference}`,
    code,
    requestId: reference,
    timestamp: new Date().toISOString(),
  };
}
