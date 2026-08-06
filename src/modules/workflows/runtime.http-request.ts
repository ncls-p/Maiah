import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { type NodeFunction } from "flowcraft";

import { executeAgent } from "@/modules/agent/runtime-executor";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";

import { resolveWorkflowSecretReferences } from "./agentic-history";
import { isPrivateIpv4 } from "./runtime.calculate-number";
import { RuntimeContext,WorkflowRuntimeDependencies,configuredEntries,inputAsText,interpolateTemplate,nodeAbortSignal,resolveTemplates,sandboxFailureMessage } from "./runtime.workflow-runtime-dependencies";

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

async function assertSafeHttpUrl(rawUrl: unknown) {
  const url = new URL(String(rawUrl ?? ""));
  if (url.protocol !== "https:") {
    throw new Error("HTTP workflow nodes only allow HTTPS URLs.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials are not allowed in workflow URLs.");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The workflow URL resolves to a private or reserved address.");
  }
  return url;
}

export const httpRequest: NodeFunction<RuntimeContext, WorkflowRuntimeDependencies> = async ({ input, params, signal, dependencies }) => {
  const resolvedParams = (await resolveWorkflowSecretReferences(params, {
    workflowId: dependencies.workflowId,
    workspaceId: dependencies.workspaceId,
  })) as Record<string, unknown>;
  const url = await assertSafeHttpUrl(resolvedParams.url);
  for (const [key, value] of configuredEntries(resolvedParams.query)) {
    const resolved = resolveTemplates(value, input);
    if (resolved !== undefined && resolved !== null) {
      url.searchParams.set(key, String(resolved));
    }
  }
  const method = String(resolvedParams.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  const headers = Object.fromEntries(configuredEntries(resolvedParams.headers).map(([key, value]) => [key, String(resolveTemplates(value, input))]));
  const hasBody = !["GET", "DELETE"].includes(method);
  const bodyValue = resolvedParams.body === undefined ? input : resolveTemplates(resolvedParams.body, input);
  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(bodyValue ?? null) : undefined,
    redirect: "manual",
    signal: nodeAbortSignal(signal, resolvedParams.__timeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("HTTP redirects are not followed by workflow nodes.");
  }
  const text = (await response.text()).slice(0, 1_000_000);
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Text responses remain strings.
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return {
    output: {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    },
  };
};

export const executeCode: NodeFunction<RuntimeContext, WorkflowRuntimeDependencies> = async ({ input, params, dependencies }) => {
  const language = params.language === "python" ? "python" : "node";
  const result = await executeCodeSandbox(
    {
      language,
      code: String(params.code ?? ""),
      stdin: inputAsText(input),
      timeoutMs: typeof params.__timeoutMs === "number" ? params.__timeoutMs : undefined,
    },
    {
      workspaceId: dependencies.workspaceId,
      userId: dependencies.userId,
    },
  );
  if (!result.ok) {
    throw new Error(sandboxFailureMessage(result));
  }
  const stdout = result.stdout.trim();
  try {
    return { output: stdout ? JSON.parse(stdout) : null };
  } catch {
    return { output: stdout };
  }
};

export const runAgent: NodeFunction<RuntimeContext, WorkflowRuntimeDependencies> = async ({ input, params, dependencies, signal }) => {
  const agentId = String(params.agentId ?? "");
  if (!agentId) throw new Error("An agent must be selected.");
  const promptValue = interpolateTemplate(String(params.prompt ?? "{{input}}"), input);
  const prompt = typeof promptValue === "string" ? promptValue : inputAsText(promptValue);
  const result = await executeAgent({
    workspaceId: dependencies.workspaceId,
    userId: dependencies.userId,
    agentId,
    prompt,
    trigger: "api",
    idempotencyKey: `${dependencies.runId}:${String(params.__nodeId ?? agentId)}`,
    abortSignal: nodeAbortSignal(signal, params.__timeoutMs),
  });
  return { output: { text: result.text, agentRunId: result.runId } };
};

export const debugSnapshot: NodeFunction<RuntimeContext> = async ({ input }) => ({
  output: input,
});
