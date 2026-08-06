import { tool } from "ai";
import { and,eq } from "drizzle-orm";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { customToolCredentialRefs,customTools } from "@/server/infrastructure/db/schema";
import { callConfiguredN8nTool,createSecretRequest } from "./use-cases.call-configured-n8n-tool";
import { ensureExternallyTriggerableWorkflow,extractWorkflowId,loadSecretPayloads,replaceSecretPlaceholders } from "./use-cases.compact-mcp-result";
import { getCustomToolBuilderConfig,secretFieldSchema,type SecretField } from "./use-cases.custom-tool-row";
import type { CustomToolBuilderInput } from "./use-cases.run-custom-tool-builder";

type BuilderConfig = Awaited<ReturnType<typeof getCustomToolBuilderConfig>>;
type WorkflowPreview = { title: string; summary: string; steps: Array<{ label: string; description: string; kind?: string }>; inputs?: string[]; outputs?: string[]; status: "draft" | "needs_secrets" | "ready" | "created" };

export function createCustomToolBuilderTools(context: { input: CustomToolBuilderInput; config: BuilderConfig; reserveBuilderAction: () => void; secretRequests: Array<{ id: string; title: string; description: string | null; fields: SecretField[]; expiresAt: Date }>; createdWorkflows: unknown[]; workflowPreviews: WorkflowPreview[]; registeredTools: Array<{ id: string; name: string; status: string }>; progressEvents: Array<{ label: string; status: "done" | "pending" }> }) {
  const { input, config, reserveBuilderAction, secretRequests, createdWorkflows, workflowPreviews, registeredTools, progressEvents } = context;
  return {
    update_workflow_preview: tool({
      description: "Update the user-facing visual preview of the automation flow. Use plain-language labels that a non-technical user can understand.",
      inputSchema: z.object({
        title: z.string().min(1).max(160),
        summary: z.string().min(1).max(600),
        status: z.enum(["draft", "needs_secrets", "ready", "created"]),
        steps: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              description: z.string().min(1).max(240),
              kind: z.string().max(40).optional(),
            }),
          )
          .min(1)
          .max(8),
        inputs: z.array(z.string().min(1).max(80)).max(8).optional(),
        outputs: z.array(z.string().min(1).max(80)).max(8).optional(),
      }),
      execute: async (preview) => {
        reserveBuilderAction();
        workflowPreviews.push(preview);
        progressEvents.push({ label: "Schéma actualisé", status: "done" });
        return { status: "preview_updated", stepCount: preview.steps.length };
      },
    }),
    request_user_secrets: tool({
      description: "Open a secure frontend modal to collect secrets or credentials. The LLM never receives submitted secret values.",
      inputSchema: z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(800).optional(),
        fields: z.array(secretFieldSchema).min(1).max(12),
      }),
      execute: async ({ title, description, fields }) => {
        reserveBuilderAction();
        const request = await createSecretRequest({
          workspaceId: input.workspaceId,
          userId: input.userId,
          title,
          description,
          fields,
        });
        secretRequests.push({
          id: request.id,
          title: request.title,
          description: request.description,
          fields,
          expiresAt: request.expiresAt,
        });
        progressEvents.push({
          label: "Connexion sécurisée demandée",
          status: "pending",
        });
        return {
          status: "pending_user_input",
          secretRequestId: request.id,
          message: "The app displayed a secure button in chat. Continue only after the user opens it, submits the modal, and a credentialRef is provided.",
        };
      },
    }),
    create_n8n_workflow: tool({
      description: "Create the backend workflow. The backend will force it to be externally triggerable for custom tool execution. Use credentialRef placeholders only; never include raw secret values.",
      inputSchema: z.object({
        name: z.string().min(1).max(255),
        nodes: z.array(z.record(z.string(), z.unknown())).min(1),
        connections: z.record(z.string(), z.unknown()).default({}),
        settings: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ name, nodes, connections, settings }) => {
        reserveBuilderAction();
        const secretPayloads = await loadSecretPayloads(input.workspaceId, input.userId, input.credentialRefs);
        const hydratedNodes = replaceSecretPlaceholders(nodes, secretPayloads) as Array<Record<string, unknown>>;
        const hydratedConnections = replaceSecretPlaceholders(connections, secretPayloads) as Record<string, unknown>;
        const triggerable = ensureExternallyTriggerableWorkflow({
          name,
          nodes: hydratedNodes,
          connections: hydratedConnections,
        });
        progressEvents.push({
          label: "Création du workflow",
          status: "pending",
        });
        const workflow = await callConfiguredN8nTool({
          config,
          workspaceId: input.workspaceId,
          toolName: config.createWorkflowToolName,
          arguments: {
            name,
            nodes: triggerable.nodes,
            connections: triggerable.connections,
            settings,
          },
        });
        const workflowId = extractWorkflowId(workflow);
        if (workflowId && config.allowWorkflowActivation) {
          await callConfiguredN8nTool({
            config,
            workspaceId: input.workspaceId,
            toolName: config.activateWorkflowToolName,
            arguments: {
              id: workflowId,
              operations: [{ type: "activateWorkflow" }],
            },
          });
        }
        createdWorkflows.push(workflow);
        progressEvents.push({ label: "Workflow créé", status: "done" });
        return { workflow, workflowId, externallyTriggerable: true };
      },
    }),
    validate_n8n_workflow: tool({
      description: "Validate a workflow through the configured n8n MCP.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        reserveBuilderAction();
        return callConfiguredN8nTool({
          config,
          workspaceId: input.workspaceId,
          toolName: config.validateWorkflowToolName,
          arguments: { id },
        });
      },
    }),
    create_n8n_credential_from_ref: tool({
      description: "Create a credential in n8n from an opaque credentialRef. This backend-only tool decrypts the stored secret payload and sends it to n8n; the LLM never sees the raw values.",
      inputSchema: z.object({
        credentialRef: z.uuid(),
        credentialType: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
      }),
      execute: async ({ credentialRef, credentialType, name }) => {
        reserveBuilderAction();
        const [ref] = await db
          .select()
          .from(customToolCredentialRefs)
          .where(and(eq(customToolCredentialRefs.id, credentialRef), eq(customToolCredentialRefs.workspaceId, input.workspaceId), eq(customToolCredentialRefs.userId, input.userId)))
          .limit(1);
        if (!ref) throw new Error("Credential ref not found");
        let data: Record<string, string>;
        try {
          data = JSON.parse(await decryptValue(ref.encryptedPayload));
        } catch {
          throw new Error("Failed to parse credential payload");
        }
        const result = await callConfiguredN8nTool({
          config,
          workspaceId: input.workspaceId,
          toolName: config.credentialToolName,
          arguments: {
            action: "create",
            operation: "create",
            credentialType,
            type: credentialType,
            name,
            data,
          },
        });
        const n8nCredentialId = typeof result === "object" && result !== null && "id" in result ? String((result as { id: unknown }).id) : undefined;
        progressEvents.push({
          label: "Connexion transmise au workflow",
          status: "done",
        });
        if (n8nCredentialId) {
          await db.update(customToolCredentialRefs).set({ n8nCredentialId }).where(eq(customToolCredentialRefs.id, ref.id));
        }
        return { credentialRef, n8nCredentialId, credentialType, name };
      },
    }),
    register_custom_tool: tool({
      description: "Register the created n8n workflow as a custom tool draft in Maiah after it has been created or specified.",
      inputSchema: z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        n8nWorkflowId: z.string().min(1).max(255).optional(),
        n8nWorkflowUrl: z.url().optional(),
        inputSchema: z.record(z.string(), z.unknown()).optional(),
        outputSchema: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ name, description, n8nWorkflowId, n8nWorkflowUrl, inputSchema, outputSchema }) => {
        reserveBuilderAction();
        const resolvedWorkflowId = n8nWorkflowId ?? (createdWorkflows.length ? (extractWorkflowId(createdWorkflows.at(-1)) ?? undefined) : undefined);
        const latestPreview = workflowPreviews.at(-1);
        const [row] = await db
          .insert(customTools)
          .values({
            workspaceId: input.workspaceId,
            createdById: input.userId,
            name,
            description: description ?? null,
            n8nWorkflowId: resolvedWorkflowId ?? null,
            n8nWorkflowUrl: n8nWorkflowUrl ?? null,
            status: resolvedWorkflowId || n8nWorkflowUrl ? "workflow_created" : "draft",
            isGlobal: input.isGlobal ?? false,
            inputSchemaJson: inputSchema ?? null,
            outputSchemaJson: outputSchema ?? null,
            metadataJson: {
              source: "builder",
              workflowPreview: latestPreview,
            },
          })
          .returning({
            id: customTools.id,
            name: customTools.name,
            status: customTools.status,
            isGlobal: customTools.isGlobal,
          });
        registeredTools.push(row);
        progressEvents.push({ label: "Tool enregistré", status: "done" });
        return row;
      },
    }),
  };
}
