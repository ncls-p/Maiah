import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  workflowAgentInputRequests,
  workflowAgentMessages,
} from "@/server/infrastructure/db/schema";

export const SECRET_REFERENCE_PATTERN =
  /__WORKFLOW_SECRET:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([a-z][a-z0-9_]{0,63})__/gi;
const EXACT_SECRET_REFERENCE_PATTERN =
  /^__WORKFLOW_SECRET:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[a-z][a-z0-9_]{0,63}__$/i;

export function isWorkflowSecretReference(value: unknown) {
  return (
    typeof value === "string" && EXACT_SECRET_REFERENCE_PATTERN.test(value)
  );
}

export const workflowAgentInputFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  type: z
    .enum(["text", "textarea", "url", "number", "secret", "password"])
    .default("text"),
  sensitive: z.boolean().default(false),
  required: z.boolean().default(true),
  description: z.string().trim().max(400).optional(),
});

export type WorkflowAgentInputField = z.infer<
  typeof workflowAgentInputFieldSchema
>;

export type WorkflowAgentInputRequest = {
  id: string;
  title: string;
  description: string | null;
  fields: WorkflowAgentInputField[];
  expiresAt: string;
};

export function parsedFields(value: unknown) {
  return z
    .array(workflowAgentInputFieldSchema)
    .min(1)
    .max(12)
    .parse(value)
    .map((field) => ({
      ...field,
      sensitive:
        field.sensitive || field.type === "secret" || field.type === "password",
    }));
}

export async function appendWorkflowAgentMessage(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  modelContent?: string;
}) {
  const content = z.string().trim().min(1).max(20_000).parse(input.content);
  const modelContent = input.modelContent
    ? z.string().trim().min(1).max(20_000).parse(input.modelContent)
    : null;
  const [message] = await db
    .insert(workflowAgentMessages)
    .values({
      workflowId: input.workflowId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      contentEncrypted: await encryptValue(content),
      modelContentEncrypted:
        modelContent && modelContent !== content
          ? await encryptValue(modelContent)
          : null,
    })
    .returning();
  return {
    id: message.id,
    role: message.role,
    content,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function getWorkflowAgentHistory(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200));
  const rows = await db
    .select()
    .from(workflowAgentMessages)
    .where(
      and(
        eq(workflowAgentMessages.workflowId, input.workflowId),
        eq(workflowAgentMessages.workspaceId, input.workspaceId),
        eq(workflowAgentMessages.userId, input.userId),
      ),
    )
    .orderBy(desc(workflowAgentMessages.createdAt))
    .limit(limit);

  const messages = await Promise.all(
    rows.reverse().map(async (row) => ({
      id: row.id,
      role: row.role,
      content: await decryptValue(row.contentEncrypted),
      modelContent: row.modelContentEncrypted
        ? await decryptValue(row.modelContentEncrypted)
        : await decryptValue(row.contentEncrypted),
      createdAt: row.createdAt.toISOString(),
    })),
  );

  const pendingRows = await db
    .select()
    .from(workflowAgentInputRequests)
    .where(
      and(
        eq(workflowAgentInputRequests.workflowId, input.workflowId),
        eq(workflowAgentInputRequests.workspaceId, input.workspaceId),
        eq(workflowAgentInputRequests.userId, input.userId),
        eq(workflowAgentInputRequests.status, "pending"),
      ),
    )
    .orderBy(desc(workflowAgentInputRequests.createdAt));

  return {
    messages,
    pendingRequests: pendingRows
      .filter((request) => request.expiresAt.getTime() > Date.now())
      .map((request) => ({
        id: request.id,
        title: request.title,
        description: request.description,
        fields: parsedFields(request.fieldsJson),
        expiresAt: request.expiresAt.toISOString(),
      })),
  };
}
