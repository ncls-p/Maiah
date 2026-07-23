import { streamText, stepCountIs, tool } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getActiveVersion,
  getAgentDefaultPreferences,
  listAgents,
  resolveProviderForVersion,
} from "@/modules/agent/use-cases";
import { createRuntimeDeadline } from "@/modules/agent/runtime-policy";
import {
  type WorkflowAgenticDraft,
  type WorkflowAgenticStreamEvent,
  validateWorkflowAgentDraft,
  workflowAgentCatalogPrompt,
  workflowAgentPromptDraft,
  workflowAgenticRequestSchema,
  workflowAgentToolLabels,
} from "@/modules/workflows/agentic";
import {
  workflowDefinitionSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
} from "@/modules/workflows/contracts";
import {
  getWorkflowDetail,
  updateWorkflow,
} from "@/modules/workflows/use-cases";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getAdapter } from "@/server/infrastructure/providers";

import { workflowErrorResponse } from "../../route-support";

const paramsSchema = z.object({ workflowId: z.uuid() });
const encoder = new TextEncoder();

function encodeEvent(event: WorkflowAgenticStreamEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "The workflow is invalid.";
  }
  if (
    error instanceof Error &&
    [
      "The workflow editing action limit was reached.",
      "The manual trigger cannot be removed.",
    ].includes(error.message)
  ) {
    return error.message;
  }
  return "The workflow assistant stopped before saving.";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = workflowAgenticRequestSchema.safeParse(
        await req.json(),
      );
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const { workflowId } = parsedParams.data;
      const { workspaceId, messages } = parsedBody.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "workflows.update",
      );
      if (forbidden) return forbidden;

      const [workflow, availableAgents] = await Promise.all([
        getWorkflowDetail(workflowId, workspaceId),
        listAgents(workspaceId, session.user.id, false),
      ]);
      const availableAgentIds = new Set(
        availableAgents.map((agent) => agent.id),
      );
      const preferences = await getAgentDefaultPreferences(
        workspaceId,
        session.user.id,
        availableAgentIds,
      );
      const builderAgent =
        availableAgents.find(
          (agent) => agent.id === preferences.effectiveDefaultAgentId,
        ) ?? availableAgents[0];
      if (!builderAgent) {
        return NextResponse.json(
          { error: "No assistant is available for agentic mode" },
          { status: 400 },
        );
      }

      const version = await getActiveVersion(builderAgent.id);
      if (!version) {
        return NextResponse.json(
          { error: "The selected assistant has no active version" },
          { status: 400 },
        );
      }
      const provider = await resolveProviderForVersion(version);
      if (!provider?.modelId) {
        return NextResponse.json(
          { error: "The selected assistant has no configured model" },
          { status: 400 },
        );
      }

      const adapter = getAdapter(provider.providerKind);
      const model = adapter.createChatModel(
        provider.runtimeConfig,
        provider.modelId,
      );
      // The visual editor can contain an incomplete draft. Let the builder
      // receive and repair it; generated changes are validated before preview
      // and the final draft is validated again before persistence.
      let draft: WorkflowAgenticDraft = parsedBody.data.draft;
      let revision = 0;
      let actionCount = 0;
      const reserveAction = () => {
        actionCount += 1;
        if (actionCount > 8) {
          throw new Error("The workflow editing action limit was reached.");
        }
      };
      const validateDefinition = (definition: unknown) =>
        validateWorkflowAgentDraft({
          workflowId,
          version: workflow.latestVersion + 1,
          definition,
          availableAgentIds,
        });

      const system = [
        "You are the workflow-building mode inside Maiah's workflow editor.",
        "Help the user create or edit only the workflow currently open. Use your tools to make concrete changes; do not merely describe changes that you can apply.",
        "Keep exactly one trigger.manual node. Build an acyclic graph and connect every useful step. Use clear, non-technical labels and lay nodes out from left to right with generous spacing.",
        "Use update_workflow_details for the name or description. Prefer upsert_workflow_nodes, remove_workflow_nodes, and replace_workflow_edges when editing an existing graph so unchanged configuration remains intact. Use replace_workflow only when rebuilding the entire graph. Then use validate_workflow before your concise final answer.",
        "Large existing parameter values may be truncated in your context. Preserve them with granular tools unless the user explicitly asks to replace them.",
        "Only use assistant IDs from the available assistant list. Never invent an ID.",
        "Never ask for or place passwords, API keys, access tokens, credentials, private URLs, or other secrets in workflow parameters. Tell the user to configure sensitive values manually after the structure is ready.",
        "Do not publish or execute the workflow. The user keeps control of those actions.",
        `Current workflow: ${JSON.stringify(workflowAgentPromptDraft(draft))}`,
        `Available assistants: ${JSON.stringify(
          availableAgents.map((agent) => ({ id: agent.id, name: agent.name })),
        )}`,
        `Supported workflow steps: ${JSON.stringify(workflowAgentCatalogPrompt())}`,
      ].join("\n\n");

      const deadline = createRuntimeDeadline(120_000, req.signal);
      const result = streamText({
        model,
        system,
        messages,
        maxOutputTokens: Math.min(version.maxOutputTokens ?? 4_000, 4_000),
        temperature: version.temperature
          ? Number.parseFloat(version.temperature)
          : undefined,
        topP: version.topP ? Number.parseFloat(version.topP) : undefined,
        abortSignal: deadline.signal,
        stopWhen: stepCountIs(10),
        tools: {
          update_workflow_details: tool({
            description:
              "Update the current workflow name or description without changing its graph.",
            inputSchema: z
              .object({
                name: z.string().trim().min(1).max(255).optional(),
                description: z.string().trim().max(2_000).nullable().optional(),
              })
              .refine(
                (value) =>
                  value.name !== undefined || value.description !== undefined,
                "Provide a name or description.",
              ),
            execute: async (input) => {
              reserveAction();
              draft = {
                ...draft,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined
                  ? { description: input.description }
                  : {}),
              };
              revision += 1;
              return { ok: true, revision };
            },
          }),
          replace_workflow: tool({
            description:
              "Replace the complete workflow graph with a valid new definition.",
            inputSchema: z.object({
              summary: z.string().trim().min(1).max(240),
              definition: workflowDefinitionSchema,
            }),
            execute: async ({ definition, summary }) => {
              reserveAction();
              draft = {
                ...draft,
                definition: validateDefinition(definition),
              };
              revision += 1;
              return {
                ok: true,
                revision,
                summary,
                nodeCount: draft.definition.nodes.length,
                edgeCount: draft.definition.edges.length,
              };
            },
          }),
          upsert_workflow_nodes: tool({
            description:
              "Add new workflow steps or replace existing steps by id while preserving all other steps and connections.",
            inputSchema: z.object({
              summary: z.string().trim().min(1).max(240),
              nodes: z.array(workflowNodeSchema).min(1).max(20),
            }),
            execute: async ({ nodes }) => {
              reserveAction();
              const byId = new Map(
                draft.definition.nodes.map((node) => [node.id, node]),
              );
              for (const node of nodes) byId.set(node.id, node);
              draft = {
                ...draft,
                definition: workflowDefinitionSchema.parse({
                  ...draft.definition,
                  nodes: Array.from(byId.values()),
                }),
              };
              revision += 1;
              return {
                ok: true,
                revision,
                updatedNodeIds: nodes.map((node) => node.id),
              };
            },
          }),
          remove_workflow_nodes: tool({
            description:
              "Remove workflow steps by id and remove their attached connections. The manual trigger cannot be removed.",
            inputSchema: z.object({
              nodeIds: z
                .array(z.string().trim().min(1).max(128))
                .min(1)
                .max(20),
            }),
            execute: async ({ nodeIds }) => {
              reserveAction();
              const removedIds = new Set(nodeIds);
              if (
                draft.definition.nodes.some(
                  (node) =>
                    removedIds.has(node.id) && node.type === "trigger.manual",
                )
              ) {
                throw new Error("The manual trigger cannot be removed.");
              }
              draft = {
                ...draft,
                definition: workflowDefinitionSchema.parse({
                  ...draft.definition,
                  nodes: draft.definition.nodes.filter(
                    (node) => !removedIds.has(node.id),
                  ),
                  edges: draft.definition.edges.filter(
                    (edge) =>
                      !removedIds.has(edge.source) &&
                      !removedIds.has(edge.target),
                  ),
                }),
              };
              revision += 1;
              return { ok: true, revision, removedNodeIds: nodeIds };
            },
          }),
          replace_workflow_edges: tool({
            description:
              "Replace all workflow connections while preserving every workflow step.",
            inputSchema: z.object({
              edges: z.array(workflowEdgeSchema).max(300),
            }),
            execute: async ({ edges }) => {
              reserveAction();
              draft = {
                ...draft,
                definition: workflowDefinitionSchema.parse({
                  ...draft.definition,
                  edges,
                }),
              };
              revision += 1;
              return {
                ok: true,
                revision,
                edgeCount: edges.length,
              };
            },
          }),
          validate_workflow: tool({
            description:
              "Validate the current workflow graph after all requested changes.",
            inputSchema: z.object({}),
            execute: async () => {
              reserveAction();
              draft = {
                ...draft,
                definition: validateDefinition(draft.definition),
              };
              return {
                ok: true,
                revision,
                nodeCount: draft.definition.nodes.length,
                edgeCount: draft.definition.edges.length,
              };
            },
          }),
        },
      });

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let streamedRevision = -1;
          try {
            controller.enqueue(
              encodeEvent({ type: "agent", name: builderAgent.name }),
            );
            for await (const part of result.stream) {
              if (part.type === "text-delta") {
                controller.enqueue(
                  encodeEvent({ type: "text", delta: part.text }),
                );
              } else if (part.type === "tool-call") {
                controller.enqueue(
                  encodeEvent({
                    type: "tool_start",
                    id: part.toolCallId,
                    toolName: part.toolName,
                    label:
                      workflowAgentToolLabels[part.toolName] ?? part.toolName,
                  }),
                );
              } else if (part.type === "tool-result") {
                controller.enqueue(
                  encodeEvent({
                    type: "tool_result",
                    id: part.toolCallId,
                    toolName: part.toolName,
                    label:
                      workflowAgentToolLabels[part.toolName] ?? part.toolName,
                  }),
                );
                if (revision !== streamedRevision) {
                  streamedRevision = revision;
                  controller.enqueue(encodeEvent({ type: "workflow", draft }));
                }
              } else if (part.type === "tool-error") {
                throw part.error instanceof Error
                  ? part.error
                  : new Error(String(part.error));
              } else if (part.type === "error") {
                throw part.error instanceof Error
                  ? part.error
                  : new Error(String(part.error));
              }
            }

            if (revision > 0) {
              draft = {
                ...draft,
                name: z.string().trim().min(1).max(255).parse(draft.name),
                definition: validateDefinition(draft.definition),
              };
              const saved = await updateWorkflow({
                workflowId,
                workspaceId,
                userId: session.user.id,
                name: draft.name,
                description: draft.description,
                definition: draft.definition,
              });
              controller.enqueue(
                encodeEvent({ type: "saved", workflow: saved }),
              );
            }
            controller.enqueue(encodeEvent({ type: "done" }));
          } catch (error) {
            controller.enqueue(
              encodeEvent({ type: "error", message: errorMessage(error) }),
            );
          } finally {
            controller.close();
          }
        },
        cancel() {
          // The request signal cancels the model call. No workflow is persisted
          // until the stream has completed successfully.
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      logLabel: "Failed to edit workflow with agentic mode",
      expectedError: workflowErrorResponse,
    },
  );
}
