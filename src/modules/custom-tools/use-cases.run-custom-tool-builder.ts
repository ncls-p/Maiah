import { generateText,stepCountIs,tool } from "ai";
import { and,eq,sql } from "drizzle-orm";
import { z } from "zod";

import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { agentRuntimePolicy,createRuntimeDeadline } from "@/modules/agent/runtime-policy";
import { db } from "@/server/infrastructure/db";
import { customToolCredentialRefs,customTools,mcpTools } from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import { callConfiguredN8nTool,createSecretRequest,inferSecretRequestFromAssistantText } from "./use-cases.call-configured-n8n-tool";
import { ensureExternallyTriggerableWorkflow,extractWorkflowId,loadSecretPayloads,replaceSecretPlaceholders } from "./use-cases.compact-mcp-result";
import { BuilderMessage,SecretField,getCustomToolBuilderConfig,resolveRuntimeProvider,secretFieldSchema } from "./use-cases.custom-tool-row";

export async function runCustomToolBuilder(input: { workspaceId: string; userId: string; messages: BuilderMessage[]; credentialRefs?: Array<{ requestId: string; credentialRef: string }>; isGlobal?: boolean }) {
  const config = await getCustomToolBuilderConfig();
  if (!config.enabled) {
    throw new Error("Custom tool builder is disabled by an administrator");
  }
  if (config.workspaceId && config.workspaceId !== input.workspaceId) {
    throw new Error("Custom tool builder is configured for another workspace");
  }

  const provider = await resolveRuntimeProvider(config);
  if (!provider) throw new Error("Custom tool builder LLM is not configured");

  const adapter = getAdapter(provider.kind);
  const model = adapter.createChatModel(provider.runtimeConfig, provider.modelId);
  const secretRequests: Array<{
    id: string;
    title: string;
    description: string | null;
    fields: SecretField[];
    expiresAt: Date;
  }> = [];
  const createdWorkflows: unknown[] = [];
  const workflowPreviews: Array<{
    title: string;
    summary: string;
    steps: Array<{ label: string; description: string; kind?: string }>;
    inputs?: string[];
    outputs?: string[];
    status: "draft" | "needs_secrets" | "ready" | "created";
  }> = [];
  const registeredTools: Array<{ id: string; name: string; status: string }> = [];
  const progressEvents: Array<{ label: string; status: "done" | "pending" }> = [];
  let builderActionCount = 0;
  function reserveBuilderAction() {
    if (builderActionCount >= agentRuntimePolicy.customToolBuilderMaxActions) {
      throw new Error("Custom tool builder action limit reached");
    }
    builderActionCount += 1;
  }

  const n8nTools = await db
    .select({ name: mcpTools.name, description: mcpTools.description })
    .from(mcpTools)
    .where(config.n8nMcpServerId ? eq(mcpTools.mcpServerId, config.n8nMcpServerId) : sql`false`);

  const system = [
    "You are a custom-tool builder assistant for an AI assistant platform.",
    "Your job is to help the user design an automation flow that can be exposed as a custom tool.",
    "Never mention n8n, MCP, implementation internals, node types, or vendor-specific workflow backend details in user-facing responses. Say automation, flow, steps, connection, or tool instead.",
    "Always keep the visual workflow preview up to date by calling update_workflow_preview whenever you propose, change, or create a flow.",
    "Security rule: never ask the user to paste secrets in chat. If credentials, API keys, OAuth tokens, passwords, webhook signing secrets, client secrets, private tokens, or webhook URLs are needed, call request_user_secrets with the exact fields in the same turn. Do not tell the user to use a secure manager; the request_user_secrets tool displays a chat button that opens the secure modal. Tell the user to click the secure button, not that a window already opened. The secret values are collected by the app and you will only receive opaque credential references later.",
    "When creating backend workflows, use credentialRef placeholders instead of raw secret values. Never output or request raw secret values.",
    "If a workflow node needs a secret value in a parameter such as a URL, put a backend placeholder in that parameter: __SECRET:<credentialRef>:<fieldName>__. Example for a submitted Discord webhook field named webhookUrl: __SECRET:<credentialRef>:webhookUrl__. Never use expressions like {{$credentials.webhookUrl}} for node URL parameters.",
    "All workflows for custom tools must be externally triggerable by the platform. Use a Webhook, Form, or Chat trigger. Never use Execute Workflow Trigger for a custom tool.",
    "Create a draft workflow only when you have enough non-secret requirements and required credential refs. Otherwise ask concise clarifying questions or request secrets through the tool.",
    "After a credentialRef is available, continue automatically. Do not stop after acknowledging the credential. Create the backend workflow, validate/activate it if possible, then call register_custom_tool before answering the user.",
    "You may also stop to ask concise clarification questions when the user's request is ambiguous. In that case, do not call creation tools yet.",
    "After creating a workflow, register it as a custom tool with a clear name, description, and JSON input schema.",
    `Configured n8n MCP tool names: create=${config.createWorkflowToolName}, validate=${config.validateWorkflowToolName}, activate=${config.activateWorkflowToolName}, credentials=${config.credentialToolName}.`,
    n8nTools.length ? `Discovered n8n MCP tools include: ${n8nTools.map((item) => item.name).join(", ")}.` : "No n8n MCP tools have been synced yet; use the configured tool names if needed.",
    input.credentialRefs?.length ? `Opaque credential refs already submitted for this turn: ${JSON.stringify(input.credentialRefs)}.` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const runtimeDeadline = createRuntimeDeadline(agentRuntimePolicy.customToolBuilderTimeoutMs);
  const result = await generateText({
    model,
    system,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stopWhen: stepCountIs(agentRuntimePolicy.customToolBuilderMaxSteps),
    maxOutputTokens: agentRuntimePolicy.customToolBuilderMaxOutputTokens,
    abortSignal: runtimeDeadline.signal,
    tools: {
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
    },
  });

  if (secretRequests.length === 0) {
    const inferredRequest = inferSecretRequestFromAssistantText(result.text);
    if (inferredRequest) {
      const request = await createSecretRequest({
        workspaceId: input.workspaceId,
        userId: input.userId,
        title: inferredRequest.title,
        description: inferredRequest.description,
        fields: inferredRequest.fields,
      });
      secretRequests.push({
        id: request.id,
        title: request.title,
        description: request.description,
        fields: inferredRequest.fields,
        expiresAt: request.expiresAt,
      });
    }
  }

  logger.info("Custom tool builder run completed", {
    workspaceId: input.workspaceId,
    userId: input.userId,
    secretRequestCount: secretRequests.length,
    createdWorkflowCount: createdWorkflows.length,
    registeredToolCount: registeredTools.length,
  });

  return {
    message: result.text,
    actionCount: secretRequests.length + createdWorkflows.length + workflowPreviews.length + registeredTools.length,
    secretRequests,
    createdWorkflows,
    workflowPreviews,
    registeredTools,
    progressEvents,
  };
}
