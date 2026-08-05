import { encryptValue } from "@/lib/crypto";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
agentToolBindings,
agentVersions,
toolInvocations
} from "@/server/infrastructure/db/schema";
import { and,eq } from "drizzle-orm";

export async function logToolInvocation(input: {
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  toolSource: string;
  toolId: string;
  toolName: string;
  riskLevel?: string | null;
  input: unknown;
  output?: unknown;
  status: string;
  latencyMs?: number;
  errorMessage?: string;
  approvedByUserId?: string;
}) {
  const [invocation] = await db
    .insert(toolInvocations)
    .values({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      toolSource: input.toolSource,
      toolId: input.toolId,
      toolName: input.toolName,
      riskLevel: input.riskLevel ?? null,
      inputJsonEncrypted: await encryptValue(
        JSON.stringify(input.input ?? null),
      ),
      outputJsonEncrypted:
        input.output === undefined
          ? null
          : await encryptValue(JSON.stringify(input.output)),
      status: input.status,
      latencyMs: input.latencyMs ?? null,
      errorMessage: input.errorMessage
        ? safeToolErrorMessage(
            new Error(input.errorMessage),
            "Tool execution failed",
          )
        : null,
      approvedByUserId: input.approvedByUserId ?? null,
      completedAt:
        input.status === "success" || input.status === "failed"
          ? new Date()
          : null,
    })
    .returning();

  return invocation;
}

export async function canExecuteRestrictedTool(
  userId: string,
  workspaceId: string,
) {
  return authorization.hasPermission(
    { principalType: "user", principalId: userId },
    "tools.executeRestricted",
    "workspace",
    workspaceId,
  );
}

export async function getAgentVersionToolContext(agentVersionId: string) {
  const [version] = await db
    .select({ agentId: agentVersions.agentId })
    .from(agentVersions)
    .where(eq(agentVersions.id, agentVersionId))
    .limit(1);

  if (!version) throw new Error("Agent version not found");

  const bindings = await db
    .select()
    .from(agentToolBindings)
    .where(
      and(
        eq(agentToolBindings.agentVersionId, agentVersionId),
        eq(agentToolBindings.toolSource, "builtin"),
      ),
    );

  return { version, bindings };
}
