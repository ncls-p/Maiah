import { NextRequest } from "next/server";

import { handleAnthropicProxyRoute } from "@/modules/anthropic-proxy/auth";
import { anthropicMessagesRequestSchema } from "@/modules/anthropic-proxy/contracts";
import { executeAnthropicMessages } from "@/modules/anthropic-proxy/service";
import { invalidRequest,validationError } from "@/modules/openai-proxy/errors";

async function requestBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw invalidRequest("The request body is not valid JSON.", null, "invalid_json");
  }
}

export async function POST(request: NextRequest) {
  return handleAnthropicProxyRoute(request, "models.invoke", async (context) => {
    const parsed = anthropicMessagesRequestSchema.safeParse(await requestBody(request));
    if (!parsed.success) throw validationError(parsed.error);
    return executeAnthropicMessages({
      context,
      request: parsed.data,
      signal: request.signal,
    });
  });
}
