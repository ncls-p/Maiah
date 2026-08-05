import { type CodeSandboxResult } from "@/modules/tool/code-sandbox";

export type WorkflowRuntimeDependencies = {
  workspaceId: string;
  workflowId: string;
  userId: string;
  runId: string;
};

export type RuntimeContext = Record<string, unknown>;
export function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function configuredEntries(value: unknown) {
  return Object.entries(objectValue(value)).filter(([key]) => key.trim());
}

export function inputAsText(input: unknown) {
  return typeof input === "string" ? input : JSON.stringify(input ?? null);
}

function boundedDiagnostic(value: string, maxChars = 8_000) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const separator = "\n… diagnostic truncated …\n";
  const headLength = Math.min(1_500, Math.floor(maxChars / 3));
  const tailLength = maxChars - headLength - separator.length;
  return `${trimmed.slice(0, headLength)}${separator}${trimmed.slice(-tailLength)}`;
}

export function sandboxFailureMessage(result: CodeSandboxResult) {
  if (result.timedOut) {
    return `Sandbox execution timed out after ${result.durationMs} ms.`;
  }
  const stderr = result.stderr.trim();
  const lines = stderr.split(/\r?\n/);
  let errorLine = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*(?:[A-Za-z_$][\w.$]*(?:Error|Exception)|Error):\s+\S/.test(lines[index] ?? "")) {
      errorLine = index;
      break;
    }
  }
  const diagnostic = errorLine >= 0 ? lines.slice(errorLine).join("\n") : stderr || result.error;
  const exitDetail = typeof result.exitCode === "number" ? ` (exit code ${result.exitCode})` : result.signal ? ` (signal ${result.signal})` : "";
  return `Sandbox execution failed${exitDetail}: ${boundedDiagnostic(diagnostic || "No error details were returned.")}`;
}

export function nodeAbortSignal(signal: AbortSignal | undefined, timeoutMs: unknown) {
  const timeout = Math.max(250, Math.min(120_000, Number(timeoutMs) || 30_000));
  const timeoutSignal = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function pathSegments(path: string) {
  const segments = path.split(".").filter(Boolean);
  if (segments.some((segment) => UNSAFE_PATH_SEGMENTS.has(segment))) {
    throw new Error("Workflow field paths cannot access object prototypes.");
  }
  return segments;
}

export function readPath(value: unknown, path: string) {
  return pathSegments(path).reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function writePath(input: unknown, path: string, value: unknown): unknown {
  const segments = pathSegments(path);
  if (segments.length === 0) return value;
  const root = { ...objectValue(input) };
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value;
      break;
    }
    const next = objectValue(current[segment]);
    current[segment] = { ...next };
    current = current[segment] as Record<string, unknown>;
  }
  return root;
}

export function removePath(input: unknown, path: string): unknown {
  const segments = pathSegments(path);
  if (segments.length === 0) return input;
  const root = { ...objectValue(input) };
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      delete current[segment];
      break;
    }
    const next = objectValue(current[segment]);
    current[segment] = { ...next };
    current = current[segment] as Record<string, unknown>;
  }
  return root;
}

function templateValue(path: string, input: unknown) {
  return path.trim() === "input" ? input : readPath(input, path.trim());
}

export function interpolateTemplate(template: string, input: unknown): unknown {
  const exact = template.match(/^\s*{{\s*([^{}]+?)\s*}}\s*$/);
  if (exact?.[1]) return templateValue(exact[1], input);
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_, path: string) => {
    const value = templateValue(path, input);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

export function resolveTemplates(value: unknown, input: unknown): unknown {
  if (typeof value === "string") return interpolateTemplate(value, input);
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, input));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, input)]));
  }
  return value;
}
