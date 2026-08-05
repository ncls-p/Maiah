import { generateText, streamText } from "ai";

import type { AnthropicMessagesRequest } from "@/modules/anthropic-proxy/contracts";
import { prepareAnthropicMessages } from "@/modules/anthropic-proxy/request-mapper";
import { buildAnthropicMessageResponse } from "@/modules/anthropic-proxy/response-builders";
import { createAnthropicMessagesStream } from "@/modules/anthropic-proxy/streams";
import { providerError } from "@/modules/openai-proxy/errors";
import {
  generationOptions,
  prepareExecution,
  usageRecorder,
} from "@/modules/openai-proxy/service";

type AnthropicExecutionContext = {
  workspaceId: string;
  userId: string;
  requestId: string;
};

export async function executeAnthropicMessages(input: {
  context: AnthropicExecutionContext;
  request: AnthropicMessagesRequest;
  signal: AbortSignal;
}) {
  const startedAt = Date.now();
  const prepared = prepareAnthropicMessages(input.request);
  const model = await prepareExecution(input.context, input.request.model);
  const recorder = usageRecorder({
    context: input.context,
    model,
    operation: "anthropic.messages",
    startedAt,
  });
  const options = generationOptions({ prepared, model, signal: input.signal });

  if (input.request.stream) {
    try {
      return createAnthropicMessagesStream({
        request: input.request,
        result: streamText(options),
        requestId: input.context.requestId,
        callbacks: {
          onComplete: (usage) => recorder.success(usage),
          onError: () => recorder.failure(),
        },
      });
    } catch (error) {
      await recorder.failure();
      throw providerError(error);
    }
  }

  try {
    const result = await generateText(options);
    await recorder.success(result.usage);
    return Response.json(
      buildAnthropicMessageResponse({ request: input.request, result }),
    );
  } catch (error) {
    await recorder.failure();
    throw providerError(error);
  }
}
