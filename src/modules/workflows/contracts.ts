import { z } from "zod";

export const workflowNodeTypeSchema = z.enum([
  "trigger.manual",
  "data.set",
  "data.pick",
  "data.remove",
  "data.rename",
  "data.template",
  "data.parseJson",
  "data.stringifyJson",
  "text.transform",
  "number.calculate",
  "list.filter",
  "list.sort",
  "list.slice",
  "logic.condition",
  "logic.delay",
  "logic.stop",
  "debug.snapshot",
  "date.now",
  "http.request",
  "code.execute",
  "agent.run",
]);

export type WorkflowNodeType = z.infer<typeof workflowNodeTypeSchema>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const workflowNodeSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: workflowNodeTypeSchema,
  label: z.string().trim().min(1).max(120),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  parameters: jsonObjectSchema.default({}),
  settings: z
    .object({
      timeoutMs: z.number().int().min(250).max(120_000).default(30_000),
      maxRetries: z.number().int().min(0).max(5).default(0),
      retryDelayMs: z.number().int().min(0).max(60_000).default(1_000),
    })
    .default({ timeoutMs: 30_000, maxRetries: 0, retryDelayMs: 1_000 }),
});

export const workflowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(180),
  source: z.string().trim().min(1).max(128),
  target: z.string().trim().min(1).max(128),
  sourceHandle: z.enum(["true", "false"]).nullable().optional(),
});

export const workflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(workflowNodeSchema).min(1).max(100),
    edges: z.array(workflowEdgeSchema).max(300),
  })
  .superRefine((definition, context) => {
    const ids = new Set<string>();
    for (const node of definition.nodes) {
      if (ids.has(node.id)) {
        context.addIssue({
          code: "custom",
          path: ["nodes"],
          message: `Duplicate node id: ${node.id}`,
        });
      }
      ids.add(node.id);
    }

    const triggers = definition.nodes.filter(
      (node) => node.type === "trigger.manual",
    );
    if (triggers.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["nodes"],
        message: "A workflow must contain exactly one manual trigger.",
      });
    }

    for (const edge of definition.edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) {
        context.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Edge ${edge.id} references a missing node.`,
        });
      }
      if (edge.source === edge.target) {
        context.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Edge ${edge.id} cannot connect a node to itself.`,
        });
      }
      const source = definition.nodes.find((node) => node.id === edge.source);
      if (source?.type === "logic.stop") {
        context.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Terminal node ${source.id} cannot have outgoing edges.`,
        });
      }
    }
  });

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const createWorkflowSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullable().optional(),
});

export const updateWorkflowSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  definition: workflowDefinitionSchema.optional(),
});

export const executeWorkflowSchema = z.object({
  workspaceId: z.uuid(),
  input: z.unknown().optional(),
  useLatestDraft: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

export function createStarterDefinition(): WorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        label: "Déclencheur API",
        position: { x: 80, y: 180 },
        parameters: {},
        settings: {
          timeoutMs: 30_000,
          maxRetries: 0,
          retryDelayMs: 1_000,
        },
      },
    ],
    edges: [],
  };
}
