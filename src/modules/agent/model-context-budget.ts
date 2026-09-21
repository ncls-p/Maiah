import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { DEFAULT_GENERATION_OUTPUT_TOKENS } from "@/modules/chat/conversation-context-policy";

export type ModelTokenLimits = {
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
};

function positiveLimit(value: number | null | undefined) {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : undefined;
}

/** Fit the final SDK request, including resolved tool schemas, before admission.
 * This is an estimate, not a provider tokenizer. Keep headroom for encoders,
 * reasoning/control tokens and multimodal inputs whose cost is model-specific.
 */
export function fitProviderOutputBudget(
  params: LanguageModelV4CallOptions,
  limits: ModelTokenLimits,
): LanguageModelV4CallOptions {
  const modelOutput = positiveLimit(limits.maxOutputTokens);
  const requested =
    positiveLimit(params.maxOutputTokens) ??
    modelOutput ??
    DEFAULT_GENERATION_OUTPUT_TOKENS;
  let output = Math.min(requested, modelOutput ?? Infinity);
  const window = positiveLimit(limits.contextWindow);
  if (window) {
    // Binary/base64 transport length is not the model's image/file token cost.
    const prompt = params.prompt.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part) =>
            part.type === "file" && part.data.type !== "text"
              ? { type: part.type, mediaType: part.mediaType, data: "[file]" }
              : part,
          )
        : message.content,
    }));
    const serialized = JSON.stringify([
      prompt,
      params.tools,
      params.responseFormat,
    ]);
    const fileCount = params.prompt.reduce(
      (count, message) =>
        count +
        (Array.isArray(message.content)
          ? message.content.filter(
              (part) => part.type === "file" && part.data.type !== "text",
            ).length
          : 0),
      0,
    );
    const estimatedInput =
      Math.ceil(new TextEncoder().encode(serialized).byteLength / 3) +
      fileCount * 4_000;
    const margin = Math.max(1_024, Math.ceil(estimatedInput * 0.15));
    output = Math.min(output, Math.max(1, window - estimatedInput - margin));
  }
  return { ...params, maxOutputTokens: output };
}
