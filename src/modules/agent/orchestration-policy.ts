import { z } from "zod";

export const orchestrationPolicyCaps = {
  maxDepth: 4,
  maxDelegations: 12,
  maxParallel: 4,
  maxChildSteps: 20,
  maxTotalTokens: 100_000,
  timeoutMs: 300_000,
  resultMaxChars: 20_000,
} as const;

export const orchestrationPolicyDefaults = {
  maxDepth: 2,
  maxDelegations: 4,
  maxParallel: 2,
  maxChildSteps: 8,
  maxTotalTokens: 50_000,
  timeoutMs: 120_000,
  resultMaxChars: 8_000,
} as const;

export const orchestrationPolicySchema = z.object({
  maxDepth: z.number().int().min(1).max(orchestrationPolicyCaps.maxDepth),
  maxDelegations: z
    .number()
    .int()
    .min(1)
    .max(orchestrationPolicyCaps.maxDelegations),
  maxParallel: z.number().int().min(1).max(orchestrationPolicyCaps.maxParallel),
  maxChildSteps: z
    .number()
    .int()
    .min(2)
    .max(orchestrationPolicyCaps.maxChildSteps),
  maxTotalTokens: z
    .number()
    .int()
    .min(1_000)
    .max(orchestrationPolicyCaps.maxTotalTokens),
  timeoutMs: z.number().int().min(5_000).max(orchestrationPolicyCaps.timeoutMs),
  resultMaxChars: z
    .number()
    .int()
    .min(1_000)
    .max(orchestrationPolicyCaps.resultMaxChars),
});

export type OrchestrationPolicy = z.infer<typeof orchestrationPolicySchema>;

export function normalizeOrchestrationPolicy(
  value: unknown,
): OrchestrationPolicy {
  const partial =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const legacyChildSteps = partial.maxChildSteps;
  return orchestrationPolicySchema.parse({
    ...orchestrationPolicyDefaults,
    ...partial,
    // A tool call and the answer that consumes its result are two distinct
    // model steps. Older configurations allowed one step, which could never
    // both use a tool and return a specialist answer.
    ...(typeof legacyChildSteps === "number"
      ? { maxChildSteps: Math.max(2, legacyChildSteps) }
      : {}),
  });
}

export const delegationBindingInputSchema = z.object({
  childAgentId: z.uuid(),
  childAgentVersionId: z.uuid(),
  instructions: z.string().trim().max(2_000).nullable().optional(),
});

export type DelegationBindingInput = z.infer<
  typeof delegationBindingInputSchema
>;
