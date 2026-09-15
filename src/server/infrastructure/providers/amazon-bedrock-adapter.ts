import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  BedrockClient,
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock";
import type {
  ProviderAdapter,
  ProviderRuntimeConfig,
  ModelDescriptor,
} from "./adapter";

function settings(config: ProviderRuntimeConfig) {
  const value = config.bedrock;
  if (!value?.region || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value.region))
    throw new Error("BEDROCK_REGION_REQUIRED");
  if (value.authMode === "api-key") {
    if (!config.apiKey?.trim()) throw new Error("BEDROCK_API_KEY_REQUIRED");
    return { region: value.region, apiKey: config.apiKey.trim() };
  }
  if (value.authMode !== "iam" || !value.accessKeyId || !value.secretAccessKey)
    throw new Error("BEDROCK_IAM_CREDENTIALS_REQUIRED");
  const credentials = {
    accessKeyId: value.accessKeyId,
    secretAccessKey: value.secretAccessKey,
    sessionToken: value.sessionToken,
  };
  // Explicit empty API key prevents credentials from another tenant's host environment being used.
  return {
    region: value.region,
    apiKey: "",
    credentialProvider: async () => credentials,
  };
}
function client(config: ProviderRuntimeConfig) {
  const value = settings(config);
  return new BedrockClient({
    region: value.region,
    maxAttempts: 2,
    ...(value.apiKey
      ? {
          token: { token: value.apiKey },
          authSchemePreference: ["httpBearerAuth"],
          credentials: async () => {
            throw new Error("BEDROCK_IAM_DISABLED");
          },
        }
      : {
          credentials: value.credentialProvider,
          token: async () => {
            throw new Error("BEDROCK_API_KEY_DISABLED");
          },
          authSchemePreference: ["sigv4"],
        }),
  });
}
const defaults = {
  text: false,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
  imageGeneration: false,
};
export function bedrockError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (
    /AccessDenied|Unauthorized|UnrecognizedClient|InvalidSignature|ExpiredToken/.test(
      name,
    )
  )
    return "BEDROCK_ACCESS_DENIED";
  if (/Throttling/.test(name)) return "BEDROCK_RATE_LIMITED";
  return error instanceof Error && /^BEDROCK_[A-Z_]+$/.test(error.message)
    ? error.message
    : "BEDROCK_CATALOG_UNAVAILABLE";
}
export const amazonBedrockAdapter: ProviderAdapter = {
  kind: "amazon-bedrock",
  async listModels(config) {
    const aws = client(config);
    const signal = AbortSignal.timeout(20_000);
    try {
      const response = await aws.send(new ListFoundationModelsCommand({}), {
        abortSignal: signal,
      });
      const summaries = (response.modelSummaries ?? []).filter(
        (m) => m.modelLifecycle?.status !== "LEGACY",
      );
      const models: ModelDescriptor[] = summaries
        .filter(
          (m) =>
            m.inferenceTypesSupported?.includes("ON_DEMAND") &&
            (m.outputModalities?.includes("TEXT") ||
              m.outputModalities?.includes("EMBEDDING") ||
              m.modelId === "amazon.nova-canvas-v1:0"),
        )
        .map((m) => ({
          modelId: m.modelId!,
          displayName: m.modelName,
          hostedBy: "Amazon Bedrock",
          capabilities: {
            ...defaults,
            imageGeneration: m.modelId === "amazon.nova-canvas-v1:0",
            text: m.outputModalities?.includes("TEXT") ?? false,
            vision: m.inputModalities?.includes("IMAGE") ?? false,
            tools: m.outputModalities?.includes("TEXT") ?? false,
            embeddings: m.outputModalities?.includes("EMBEDDING") ?? false,
          },
        }));
      let nextToken: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await aws.send(
          new ListInferenceProfilesCommand({ nextToken, maxResults: 100 }),
          { abortSignal: signal },
        );
        for (const profile of page.inferenceProfileSummaries ?? []) {
          if (profile.status !== "ACTIVE" || !profile.inferenceProfileId)
            continue;
          const sourceId = profile.models?.[0]?.modelArn?.split("/").pop();
          const source = summaries.find((m) => m.modelId === sourceId);
          if (source && !source.outputModalities?.includes("TEXT")) continue;
          models.push({
            modelId: profile.inferenceProfileArn ?? profile.inferenceProfileId,
            displayName: profile.inferenceProfileName,
            hostedBy: "Amazon Bedrock",
            capabilities: {
              ...defaults,
              text: true,
              tools: true,
              vision: source?.inputModalities?.includes("IMAGE") ?? false,
            },
          });
        }
        nextToken = page.nextToken;
        if (nextToken && seen.has(nextToken))
          throw new Error("BEDROCK_PAGINATION_INVALID");
        if (nextToken) seen.add(nextToken);
      } while (nextToken);
      return [...new Map(models.map((m) => [m.modelId, m])).values()];
    } catch (error) {
      throw new Error(bedrockError(error));
    } finally {
      aws.destroy();
    }
  },
  async validateConnection(config) {
    const start = Date.now();
    try {
      await this.listModels!(config);
      return {
        status: "healthy",
        message: "Bedrock catalog accessible",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: bedrockError(error),
        latencyMs: Date.now() - start,
      };
    }
  },
  createChatModel(config, modelId) {
    return createAmazonBedrock(settings(config))(modelId);
  },
  createImageModel(config, modelId) {
    return createAmazonBedrock(settings(config)).imageModel(modelId);
  },
  createEmbeddingModel(config, modelId) {
    return createAmazonBedrock(settings(config)).embeddingModel(modelId);
  },
};
