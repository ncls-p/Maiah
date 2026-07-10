import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { toolInvocations } from "@/server/infrastructure/db/schema";

type ToolInvocation = typeof toolInvocations.$inferSelect;

export type InvocationTransition =
  | { kind: "claimed"; invocation: ToolInvocation }
  | { kind: "unchanged"; invocation: ToolInvocation }
  | { kind: "missing" };

async function currentInvocation(
  invocationId: string,
): Promise<InvocationTransition> {
  const [invocation] = await db
    .select()
    .from(toolInvocations)
    .where(eq(toolInvocations.id, invocationId))
    .limit(1);
  return invocation ? { kind: "unchanged", invocation } : { kind: "missing" };
}

export async function claimToolInvocationForExecution(
  invocationId: string,
  userId: string,
): Promise<InvocationTransition> {
  const [invocation] = await db
    .update(toolInvocations)
    .set({
      status: "running",
      approvedByUserId: userId,
      errorMessage: null,
    })
    .where(
      and(
        eq(toolInvocations.id, invocationId),
        eq(toolInvocations.status, "awaiting_approval"),
      ),
    )
    .returning();

  return invocation
    ? { kind: "claimed", invocation }
    : currentInvocation(invocationId);
}

export async function rejectPendingToolInvocation(
  invocationId: string,
  userId: string,
): Promise<InvocationTransition> {
  const [invocation] = await db
    .update(toolInvocations)
    .set({
      status: "rejected",
      errorMessage: "Rejected by user",
      approvedByUserId: userId,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(toolInvocations.id, invocationId),
        eq(toolInvocations.status, "awaiting_approval"),
      ),
    )
    .returning();

  return invocation
    ? { kind: "claimed", invocation }
    : currentInvocation(invocationId);
}

export async function completeToolInvocationSuccess(
  invocationId: string,
  input: { encryptedOutput: string; latencyMs: number },
) {
  const [invocation] = await db
    .update(toolInvocations)
    .set({
      outputJsonEncrypted: input.encryptedOutput,
      status: "success",
      latencyMs: input.latencyMs,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(toolInvocations.id, invocationId),
        eq(toolInvocations.status, "running"),
      ),
    )
    .returning({ id: toolInvocations.id });
  return Boolean(invocation);
}

export async function completeToolInvocationFailure(
  invocationId: string,
  input: { errorMessage: string; latencyMs: number },
) {
  const [invocation] = await db
    .update(toolInvocations)
    .set({
      status: "failed",
      errorMessage: input.errorMessage,
      latencyMs: input.latencyMs,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(toolInvocations.id, invocationId),
        eq(toolInvocations.status, "running"),
      ),
    )
    .returning({ id: toolInvocations.id });
  return Boolean(invocation);
}
