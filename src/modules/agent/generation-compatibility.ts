import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";

const aliases = {
  temperature: "temperature",
  top_p: "topP",
  topP: "topP",
  top_k: "topK",
  topK: "topK",
  presence_penalty: "presencePenalty",
  presencePenalty: "presencePenalty",
  frequency_penalty: "frequencyPenalty",
  frequencyPenalty: "frequencyPenalty",
  seed: "seed",
  stop: "stopSequences",
  stop_sequences: "stopSequences",
  stopSequences: "stopSequences",
} as const;
export type UnsupportedSetting = (typeof aliases)[keyof typeof aliases];
export const unsupportedSettings = [...new Set(Object.values(aliases))];

// Only an explicit client-side parameter rejection is safe to retry. In-stream
// errors, network failures, quota errors and ambiguous failures are never replayed.
export function rejectedSetting(
  error: unknown,
): UnsupportedSetting | undefined {
  if (
    !APICallError.isInstance(error) ||
    ![400, 422].includes(error.statusCode ?? 0)
  )
    return;
  let detail: { param?: string; message?: string; code?: string } = {};
  try {
    const body = JSON.parse(error.responseBody ?? "{}");
    const candidate = body?.error ?? body;
    if (candidate && typeof candidate === "object") detail = candidate;
  } catch {
    /* Some providers only return a plain message. */
  }
  const message = detail.message ?? error.message;
  if (
    !/not supported|unsupported|does not support|not allowed|only (?:the )?default/i.test(
      message,
    )
  )
    return;
  if (detail.param && detail.param in aliases)
    return aliases[detail.param as keyof typeof aliases];
  // Require a quoted exact parameter name; do not guess from arbitrary prose.
  for (const [name, setting] of Object.entries(aliases))
    if (message.includes(`'${name}'`) || message.includes(`"${name}"`))
      return setting;
}

export function withGenerationCompatibility(
  model: LanguageModelV4,
  input: {
    excluded: UnsupportedSetting[];
    persist: (setting: UnsupportedSetting) => Promise<void>;
  },
) {
  const excluded = new Set(input.excluded);
  const remember = async (setting: UnsupportedSetting) => {
    if (excluded.has(setting)) return;
    await input.persist(setting);
    excluded.add(setting);
  };
  const warn = async (
    warnings: SharedV4Warning[] | undefined,
    params: LanguageModelV4CallOptions,
  ) => {
    for (const warning of warnings ?? []) {
      if (warning.type !== "unsupported") continue;
      const setting = aliases[warning.feature as keyof typeof aliases];
      if (setting && params[setting] !== undefined) await remember(setting);
    }
  };
  async function attempt<T>(
    params: LanguageModelV4CallOptions,
    call: (params: LanguageModelV4CallOptions) => PromiseLike<T>,
  ): Promise<T> {
    const adjusted = { ...params };
    for (const setting of excluded) delete adjusted[setting];
    // There are only seven eligible sampling settings; each is removed at most once.
    for (let retry = 0; ; retry++) {
      params.abortSignal?.throwIfAborted();
      try {
        const result = await call(adjusted);

        return result;
      } catch (error) {
        const setting = rejectedSetting(error);
        if (
          !setting ||
          adjusted[setting] === undefined ||
          retry >= unsupportedSettings.length
        )
          throw error;
        await remember(setting);
        delete adjusted[setting];
      }
    }
  }
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ params, model }) => {
        const result = await attempt(params, (p) => model.doGenerate(p));
        await warn(result.warnings, params);
        return result;
      },
      wrapStream: async ({ params, model }) => {
        const result = await attempt(params, (p) => model.doStream(p));
        return {
          ...result,
          stream: result.stream.pipeThrough(
            new TransformStream({
              async transform(chunk, controller) {
                if (chunk.type === "stream-start")
                  await warn(chunk.warnings, params);
                controller.enqueue(chunk);
              },
            }),
          ),
        };
      },
    },
  });
}
