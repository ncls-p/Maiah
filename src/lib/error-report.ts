export type ErrorReport = {
  message: string;
  timestamp: string;
  page: string;
  reference?: string;
};

/** Diagnostics must never include request bodies, query parameters or credentials. */
export function redactErrorText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[URL]";
      }
    })
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(
      /((?:api[_-]?key|authorization|password|secret(?:AccessKey)?|accessKeyId|sessionToken|token|cookie)["']?\s*[=:]\s*["']?)[^"'\s,;]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 12000);
}
export function createErrorReport(
  message: string,
  reference?: string,
): ErrorReport {
  return {
    message: redactErrorText(message),
    timestamp: new Date().toISOString(),
    page: typeof window === "undefined" ? "" : window.location.pathname,
    ...(reference ? { reference: redactErrorText(reference) } : {}),
  };
}
export function formatErrorReport(report: ErrorReport) {
  return JSON.stringify(report, null, 2);
}
export function showErrorReport(report: ErrorReport) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("maiah:error-details", { detail: report }),
    );
}
