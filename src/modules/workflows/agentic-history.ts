import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  workflowAgentInputRequests,
  workflowAgentMessages,
} from "@/server/infrastructure/db/schema";

const SECRET_REFERENCE_PATTERN =
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

function parsedFields(value: unknown) {
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

export async function createWorkflowAgentInputRequest(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  title: string;
  description?: string;
  fields: WorkflowAgentInputField[];
}) {
  const fields = parsedFields(input.fields);
  const [request] = await db
    .insert(workflowAgentInputRequests)
    .values({
      workflowId: input.workflowId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: z.string().trim().min(1).max(255).parse(input.title),
      description: input.description?.trim() || null,
      fieldsJson: fields,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "workflow.agentInputRequested",
    resourceType: "workflow_agent_input_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      workflowId: input.workflowId,
      fields: fields.map((field) => ({
        name: field.name,
        sensitive: field.sensitive,
      })),
    },
  });

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    fields,
    expiresAt: request.expiresAt.toISOString(),
  } satisfies WorkflowAgentInputRequest;
}

export async function submitWorkflowAgentInputRequest(input: {
  requestId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
  values: Record<string, string>;
}) {
  const [request] = await db
    .select()
    .from(workflowAgentInputRequests)
    .where(
      and(
        eq(workflowAgentInputRequests.id, input.requestId),
        eq(workflowAgentInputRequests.workflowId, input.workflowId),
        eq(workflowAgentInputRequests.workspaceId, input.workspaceId),
        eq(workflowAgentInputRequests.userId, input.userId),
      ),
    )
    .limit(1);
  if (!request) throw new Error("Information request not found");
  if (request.status !== "pending")
    throw new Error("Information request is no longer pending");
  if (request.expiresAt.getTime() < Date.now())
    throw new Error("Information request expired");

  const fields = parsedFields(request.fieldsJson);
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = input.values[field.name]?.trim() ?? "";
    if (field.required && !value) {
      throw new Error(`Missing value for ${field.label}`);
    }
    if (field.type === "url" && value) {
      z.url().parse(value);
    }
    if (value.length > 20_000) {
      throw new Error(`Value is too long for ${field.label}`);
    }
    values[field.name] = value;
  }

  await db
    .update(workflowAgentInputRequests)
    .set({
      status: "submitted",
      valuesEncrypted: await encryptValue(JSON.stringify(values)),
      submittedAt: new Date(),
    })
    .where(eq(workflowAgentInputRequests.id, request.id));

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "workflow.agentInputSubmitted",
    resourceType: "workflow_agent_input_request",
    resourceId: request.id,
    outcome: "success",
    metadata: {
      workflowId: input.workflowId,
      fields: fields.map((field) => ({
        name: field.name,
        sensitive: field.sensitive,
      })),
    },
  });

  return {
    id: request.id,
    displayMessage: fields.some((field) => field.sensitive)
      ? "Les informations demandées ont été fournies. Les valeurs sensibles sont enregistrées en sécurité."
      : "Les informations demandées ont été fournies.",
  };
}

export async function consumeWorkflowAgentInputRequest(input: {
  requestId: string;
  workflowId: string;
  workspaceId: string;
  userId: string;
}) {
  const [request] = await db
    .select()
    .from(workflowAgentInputRequests)
    .where(
      and(
        eq(workflowAgentInputRequests.id, input.requestId),
        eq(workflowAgentInputRequests.workflowId, input.workflowId),
        eq(workflowAgentInputRequests.workspaceId, input.workspaceId),
        eq(workflowAgentInputRequests.userId, input.userId),
      ),
    )
    .limit(1);
  if (!request || request.status !== "submitted" || !request.valuesEncrypted) {
    throw new Error("Submitted information is unavailable");
  }

  const fields = parsedFields(request.fieldsJson);
  const values = z
    .record(z.string(), z.string())
    .parse(JSON.parse(await decryptValue(request.valuesEncrypted)));
  const displayLines = fields.map((field) =>
    field.sensitive
      ? `- ${field.label}: enregistrée en sécurité`
      : `- ${field.label}: ${values[field.name] ?? ""}`,
  );
  const modelLines = fields.map((field) =>
    field.sensitive
      ? `- ${field.label}: __WORKFLOW_SECRET:${request.id}:${field.name}__`
      : `- ${field.label}: ${values[field.name] ?? ""}`,
  );

  await db
    .update(workflowAgentInputRequests)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(eq(workflowAgentInputRequests.id, request.id));

  return {
    displayContent: `Informations fournies :\n${displayLines.join("\n")}`,
    modelContent: [
      "The user submitted the requested information.",
      ...modelLines,
      "Use each opaque __WORKFLOW_SECRET reference exactly as provided in workflow parameters. Never ask to reveal or repeat its value.",
    ].join("\n"),
  };
}

export async function resolveWorkflowSecretReferences(
  value: unknown,
  input: { workflowId: string; workspaceId: string },
): Promise<unknown> {
  const serialized = JSON.stringify(value) ?? "";
  const references = Array.from(
    serialized.matchAll(SECRET_REFERENCE_PATTERN),
  ).map((match) => ({ requestId: match[1], fieldName: match[2] }));
  const requestIds = Array.from(
    new Set(references.map((reference) => reference.requestId)),
  );
  if (requestIds.length === 0) return value;
  if (requestIds.length > 20) {
    throw new Error("Too many secure workflow references.");
  }

  const rows = await db
    .select()
    .from(workflowAgentInputRequests)
    .where(
      and(
        inArray(workflowAgentInputRequests.id, requestIds),
        eq(workflowAgentInputRequests.workflowId, input.workflowId),
        eq(workflowAgentInputRequests.workspaceId, input.workspaceId),
        eq(workflowAgentInputRequests.status, "consumed"),
      ),
    );
  const valuesByRequest = new Map<string, Record<string, string>>();
  const fieldsByRequest = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.valuesEncrypted) continue;
    const fields = parsedFields(row.fieldsJson);
    fieldsByRequest.set(
      row.id,
      new Set(
        fields.filter((field) => field.sensitive).map((field) => field.name),
      ),
    );
    valuesByRequest.set(
      row.id,
      z
        .record(z.string(), z.string())
        .parse(JSON.parse(await decryptValue(row.valuesEncrypted))),
    );
  }

  const replace = (current: unknown): unknown => {
    if (typeof current === "string") {
      return current.replace(
        SECRET_REFERENCE_PATTERN,
        (placeholder, requestId: string, fieldName: string) => {
          const allowedFields = fieldsByRequest.get(requestId);
          const resolved = valuesByRequest.get(requestId)?.[fieldName];
          if (!allowedFields?.has(fieldName) || resolved === undefined) {
            throw new Error(
              `Secure workflow reference is unavailable: ${placeholder}`,
            );
          }
          return resolved;
        },
      );
    }
    if (Array.isArray(current)) return current.map(replace);
    if (typeof current === "object" && current !== null) {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [key, replace(item)]),
      );
    }
    return current;
  };

  return replace(value);
}
