import { and,eq } from "drizzle-orm";
import { z } from "zod";

import { decryptValue,encryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
workflowAgentInputRequests
} from "@/server/infrastructure/db/schema";
import {
WorkflowAgentInputField,
WorkflowAgentInputRequest,
parsedFields,
} from "./agentic-history.secret-reference-pattern";

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
