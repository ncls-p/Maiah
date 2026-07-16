import { NextRequest } from "next/server";

import { handleOpenAIProxyRoute } from "@/modules/openai-proxy/auth";
import { chatCompletionRequestSchema } from "@/modules/openai-proxy/contracts";
import { invalidRequest, validationError } from "@/modules/openai-proxy/errors";
import { executeChatCompletion } from "@/modules/openai-proxy/service";

async function requestBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw invalidRequest(
      "The request body is not valid JSON.",
      null,
      "invalid_json",
    );
  }
}

export async function POST(request: NextRequest) {
  return handleOpenAIProxyRoute(request, "models.invoke", async (context) => {
    const parsed = chatCompletionRequestSchema.safeParse(
      await requestBody(request),
    );
    if (!parsed.success) throw validationError(parsed.error);
    return executeChatCompletion({
      context,
      request: parsed.data,
      signal: request.signal,
    });
  });
}
