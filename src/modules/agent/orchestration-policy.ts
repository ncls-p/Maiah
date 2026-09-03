import { z } from "zod";

export const orchestrationPolicyCaps = {
  // Persisted counters use PostgreSQL INTEGER columns. Zero is reserved for
  // "unlimited", so finite values may use the complete positive range.
  finiteInteger: 2_147_483_647,
  // The UI deliberately has no product-level maximum. This ceiling only keeps
  // persisted deadlines inside JavaScript's representable Date range.
  timeoutMs: 8_000_000_000_000_000,
} as const;

export const orchestrationPolicyDefaults = {
  maxDepth: 2,
  maxDelegations: 4,
  maxParallel: 2,
  maxChildSteps: 8,
  maxTotalTokens: 50_000,
  timeoutMs: 0,
  resultMaxChars: 8_000,
} as const;

export const orchestrationPolicySchema = z.object({
  maxDepth: z.number().int().min(0).max(orchestrationPolicyCaps.finiteInteger),
  maxDelegations: z
    .number()
    .int()
    .min(0)
    .max(orchestrationPolicyCaps.finiteInteger),
  maxParallel: z
    .number()
    .int()
    .min(0)
    .max(orchestrationPolicyCaps.finiteInteger),
  maxChildSteps: z.union([
    z.literal(0),
    z.number().int().min(2).max(orchestrationPolicyCaps.finiteInteger),
  ]),
  maxTotalTokens: z
    .number()
    .int()
    .min(0)
    .max(orchestrationPolicyCaps.finiteInteger),
  timeoutMs: z.number().int().min(0).max(orchestrationPolicyCaps.timeoutMs),
  resultMaxChars: z
    .number()
    .int()
    .min(0)
    .max(orchestrationPolicyCaps.finiteInteger),
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
      ? { maxChildSteps: legacyChildSteps === 1 ? 2 : legacyChildSteps }
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
