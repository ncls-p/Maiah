import { multipartBody } from "./files";
import { object } from "./input-contract";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { env } from "@/lib/env";
import { availableActions, actionPath, type McpIdentity } from "./catalog";

export const actionInput = z.object({
  operationId: z.string().min(1).max(200),
  parameters: z.record(z.string(), z.string().max(300)).default({}),
  query: z.record(z.string(), z.string().max(2000)).default({}),
  body: z.unknown().optional(),
});
export async function executeAction(
  identity: McpIdentity,
  input: z.infer<typeof actionInput>,
  signal?: AbortSignal,
) {
  const action = availableActions(identity).find(
    (item) => item.operationId === input.operationId,
  );
  if (!action) throw new Error("Unknown or unavailable action");
  const path = actionPath(action, input.parameters, input.query);
  const serialized =
    input.body === undefined ? undefined : JSON.stringify(input.body);
  if (serialized && serialized.length > 256_000)
    throw new Error("Action body too large");
  const isMultipart =
    action.bodyKind === "multipart" && Array.isArray(object(input.body).files);
  const body = isMultipart ? multipartBody(object(input.body)) : serialized;
  if (body && (action.method === "GET" || action.bodyKind === "none"))
    throw new Error("This action does not accept a JSON body");

  const response = await fetch(new URL(path, env.BETTER_AUTH_URL), {
    method: action.method,
    redirect: "error",
    cache: "no-store",
    headers: {
      ...identity.headers,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
      Origin: new URL(env.BETTER_AUTH_URL).origin,
    },
    body,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  if (
    response.ok &&
    (action.responseKind === "stream" ||
      response.headers.has("content-disposition"))
  ) {
    await response.body?.cancel();
    return {
      ok: true,
      status: response.status,
      requestId: response.headers.get("x-request-id"),
      result: {
        download: {
          path,
          contentType: response.headers.get("content-type"),
          requiresAuthentication: true,
        },
        instruction:
          "Open the authenticated download link, or download it with the same API token. This is a file, not model-readable text.",
      },
    };
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1_000_000) {
          await reader.cancel();
          throw new Error("Response too large; narrow the action query");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  const text = Buffer.concat(chunks).toString("utf8");
  let result: unknown = text;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    /* Preserve a bounded non-JSON error. */
  }
  logger.info("Maiah MCP action completed", {
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    authentication: identity.authentication,
    operationId: action.operationId,
    status: response.status,
    requestId: response.headers.get("x-request-id"),
  });
  return {
    ok: response.ok,
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    result,
  };
}
