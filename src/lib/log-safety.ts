import { redactErrorText } from "./error-report";

const sensitiveKey =
  /authorization|cookie|password|secret|token|api.?key|credential|^headers$|^params$|^query$|^body$|^requestBody$|^responseBody$/i;

export function safeLogText(value: string): string {
  // ORM errors embed bind parameters in their message and stack, not just fields.
  return redactErrorText(
    value
      .replace(/\nparams:[\s\S]*/i, "\nparams: [REDACTED]")
      .replace(
        /((?:password|secret|token|authorization|cookie|api[_-]?key)["']?\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi,
        "$1[REDACTED]",
      ),
  );
}

/** Bounded, cycle-safe diagnostics. Never serialize arbitrary Error properties. */
export function safeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return safeLogText(value);
  if (typeof value === "bigint") return String(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= 6) return "[Truncated]";
  seen.add(value);
  if (value instanceof Error) {
    const error = value as Error & {
      code?: unknown;
      status?: unknown;
      constraint?: unknown;
    };
    return safeLogValue(
      {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status,
        constraint: error.constraint,
        cause: error.cause,
      },
      depth + 1,
      seen,
    );
  }
  if (Array.isArray(value))
    return value
      .slice(0, 30)
      .map((item) => safeLogValue(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 60)
      .map(([key, item]) => [
        key,
        sensitiveKey.test(key)
          ? "[REDACTED]"
          : safeLogValue(item, depth + 1, seen),
      ]),
  );
}
