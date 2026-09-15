import type { ModelDescriptor } from "./adapter";
import { parseModels } from "./openai-compatible-adapter.parse-models";

export function parseGatewayCatalog(data: unknown): ModelDescriptor[] {
  if (
    !data ||
    typeof data !== "object" ||
    !("data" in data) ||
    !Array.isArray(data.data)
  )
    return [];
  return data.data.flatMap((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("id" in entry) ||
      typeof entry.id !== "string"
    )
      return [];
    const model = entry as Record<string, unknown>;
    const pricing = model.pricing as Record<string, unknown> | undefined;
    const perMillion = (value: unknown) => {
      if (
        (typeof value !== "string" && typeof value !== "number") ||
        String(value).trim() === ""
      )
        return undefined;
      const amount = Number(value) * 1_000_000;
      return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
    };
    const modalities = model.modalities as
      | { input?: string[]; output?: string[] }
      | undefined;
    const parsed = parseModels({
      data: [
        {
          ...model,
          architecture: {
            input_modalities: modalities?.input,
            output_modalities: modalities?.output,
          },
          max_model_len: model.context_window,
          pricing: {
            input_per_million:
              model.type === "image" ? undefined : perMillion(pricing?.input),
            output_per_million:
              model.type === "image" ? undefined : perMillion(pricing?.output),
            currency: "USD",
          },
        },
      ],
    })[0];
    const tags = Array.isArray(model.tags)
      ? model.tags
          .filter(
            (tag): tag is string =>
              typeof tag === "string" && tag.length > 0 && tag.length <= 40,
          )
          .slice(0, 20)
      : [];
    return [
      {
        ...parsed,
        displayName: typeof model.name === "string" ? model.name : entry.id,
        description:
          typeof model.description === "string"
            ? model.description.slice(0, 2000)
            : undefined,
        tags,
        maxOutputTokens:
          typeof model.max_tokens === "number" && model.max_tokens > 0
            ? model.max_tokens
            : undefined,
        capabilities: {
          ...parsed.capabilities,
          embeddings: model.type === "embedding",
          imageGeneration:
            model.type === "image" || parsed.capabilities.imageGeneration,
          tools: tags.includes("tool-use"),
          reasoning: tags.includes("reasoning"),
        },
      },
    ];
  });
}
