import {
listOpenAIProxyModels,
resolveOpenAIProxyModel,
} from "@/modules/openai-proxy/model-catalog";

function toAnthropicModel(
  model: Awaited<ReturnType<typeof listOpenAIProxyModels>>[number],
) {
  return {
    id: model.id,
    created_at: new Date(model.created * 1000).toISOString(),
    display_name: model.display_name,
    type: "model" as const,
  };
}

export async function listAnthropicProxyModels(workspaceId: string) {
  const models = (await listOpenAIProxyModels(workspaceId)).map(
    toAnthropicModel,
  );
  return {
    data: models,
    has_more: false,
    first_id: models[0]?.id ?? null,
    last_id: models.at(-1)?.id ?? null,
  };
}

export async function retrieveAnthropicProxyModel(
  workspaceId: string,
  modelId: string,
) {
  const model = await resolveOpenAIProxyModel(workspaceId, modelId);
  return toAnthropicModel(model.publicModel);
}
