export const rootAgent = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  createdById: "33333333-3333-4333-8333-333333333333",
  name: "Root agent",
  kind: "assistant",
};
export const rootVersion = {
  id: "44444444-4444-4444-8444-444444444444",
  agentId: rootAgent.id,
  systemPrompt: "Help",
  maxToolCalls: 0,
  maxOutputTokens: 4_000,
  orchestrationPolicyJson: null,
  approvalPolicyJson: null,
};
export const provider = { providerId: "55555555-5555-4555-8555-555555555555", modelRecordId: "66666666-6666-4666-8666-666666666666", modelId: "model-api-id", providerKind: "openai", runtimeConfig: {} };
export const childAgent = { ...rootAgent, id: "88888888-8888-4888-8888-888888888888", name: "Research specialist", kind: "assistant" };
export const childVersion = { ...rootVersion, id: "99999999-9999-4999-8999-999999999999", agentId: childAgent.id, maxToolCalls: 4 };
export const orchestrator = { ...rootAgent, kind: "orchestrator" };
export const orchestratorVersion = {
  ...rootVersion,
  maxToolCalls: 4,
  orchestrationPolicyJson: { maxDepth: 2, maxDelegations: 4, maxParallel: 2, maxChildSteps: 4, maxTotalTokens: 10_000, timeoutMs: 30_000, resultMaxChars: 4_000 },
};
