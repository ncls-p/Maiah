import { z } from "zod";

export const workflowToolParametersSchema = z.object({
  source: z.enum(["builtin", "mcp", "custom"]),
  toolId: z.uuid(),
  connectionId: z.uuid().optional(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  outputPath: z.string().trim().min(1).default("toolResult"),
});

export type WorkflowToolOption = {
  id: string;
  source: "builtin" | "mcp" | "custom";
  name: string;
  description: string | null;
  group: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  requireApproval: boolean;
  connections?: Array<{ id: string; label: string; isDefault: boolean }>;
};
