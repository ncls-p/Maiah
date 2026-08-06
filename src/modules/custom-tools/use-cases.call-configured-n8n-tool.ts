import { eq } from "drizzle-orm";
import { z } from "zod";

import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { customToolSecretRequests,mcpTools } from "@/server/infrastructure/db/schema";
import { compactMcpResult } from "./use-cases.compact-mcp-result";
import { CustomToolBuilderConfig,SecretField,secretFieldSchema } from "./use-cases.custom-tool-row";

async function resolveConfiguredMcpToolName(serverId: string, toolName: string) {
  const tools = await db.select({ name: mcpTools.name }).from(mcpTools).where(eq(mcpTools.mcpServerId, serverId));
  const names = tools.map((item) => item.name);
  if (names.includes(toolName)) return toolName;
  const suffixMatch = names.find((name) => name.endsWith(`__${toolName}`));
  if (suffixMatch) return suffixMatch;
  const compactName = toolName.replace(/^n8n_/, "");
  const compactMatch = names.find((name) => name.endsWith(`__${compactName}`) || name.endsWith(`__n8n_${compactName}`));
  if (compactMatch) return compactMatch;
  return toolName;
}

export async function callConfiguredN8nTool(input: { config: CustomToolBuilderConfig; workspaceId: string; toolName: string; arguments: Record<string, unknown> }) {
  if (!input.config.n8nMcpServerId) {
    throw new Error("n8n MCP server is not configured");
  }
  const server = await getMcpServer(input.config.n8nMcpServerId, input.workspaceId);
  if (!server) throw new Error("Configured n8n MCP server was not found in this workspace");
  if (!server.enabled) throw new Error("Configured n8n MCP server is disabled");
  if (!server.url) throw new Error("Configured n8n MCP server must expose an SSE or streamable HTTP URL for web usage");
  const toolName = await resolveConfiguredMcpToolName(server.id, input.toolName);
  const result = await callRemoteMcpTool(server, toolName, input.arguments);
  return compactMcpResult(result);
}

export function safeCredentialSummary(fields: SecretField[], credentialRefId: string) {
  return {
    credentialRef: credentialRefId,
    fields: fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      received: true,
    })),
  };
}

export function inferSecretRequestFromAssistantText(text: string): { title: string; description: string; fields: SecretField[] } | null {
  const normalized = text.toLowerCase();
  const saysSecretIsAlreadyHandled = normalized.includes("aucun secret") || normalized.includes("secret n’a été exposé") || normalized.includes("secret n'a été exposé") || normalized.includes("secrets reçus") || normalized.includes("connexion sécurisée reçue") || normalized.includes("connexion sécurisée a bien été reçue");
  if (saysSecretIsAlreadyHandled) return null;

  const asksForSecureInput = /(il me manque|j'ai besoin|j’ai besoin|fournir|renseigner|ajoute|clique|ne la colle pas|webhook discord|url du webhook|connexion .*cible)/.test(normalized) && /(secret|token|api key|clé api|webhook|credential|connexion sécurisée|gestionnaire sécurisé)/.test(normalized);
  if (!asksForSecureInput) return null;

  if (normalized.includes("discord") && normalized.includes("webhook")) {
    return {
      title: "Connexion Discord",
      description: "Ajoute l’URL du webhook Discord. Elle sera chiffrée et masquée à l’assistant.",
      fields: [
        {
          name: "discord_webhook_url",
          label: "URL du webhook Discord",
          type: "secret",
          required: true,
          description: "Colle l’URL du webhook du salon cible.",
        },
      ],
    };
  }

  if (normalized.includes("webhook")) {
    return {
      title: "Connexion webhook",
      description: "Ajoute l’URL du webhook. Elle sera chiffrée et masquée à l’assistant.",
      fields: [
        {
          name: "webhook_url",
          label: "URL du webhook",
          type: "secret",
          required: true,
        },
      ],
    };
  }

  return {
    title: "Connexion sécurisée",
    description: "Ajoute le secret requis. Il sera chiffré et masqué à l’assistant.",
    fields: [
      {
        name: "secret_value",
        label: normalized.includes("token") ? "Token" : "Secret",
        type: "secret",
        required: true,
      },
    ],
  };
}

export async function createSecretRequest(input: { workspaceId: string; userId: string; title: string; description?: string; fields: SecretField[]; customToolId?: string }) {
  const fields = z.array(secretFieldSchema).min(1).max(12).parse(input.fields);
  const [request] = await db
    .insert(customToolSecretRequests)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      customToolId: input.customToolId ?? null,
      title: input.title,
      description: input.description ?? null,
      fieldsJson: fields,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "customTool.secretRequestCreated",
    resourceType: "custom_tool_secret_request",
    resourceId: request.id,
    outcome: "success",
    metadata: { fieldNames: fields.map((field) => field.name) },
  });

  return request;
}
