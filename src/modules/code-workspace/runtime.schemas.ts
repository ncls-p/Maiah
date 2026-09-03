import { z } from "zod";

const workspacePathSchema = z.string().trim().min(1).max(260);

export const workspaceReadInputSchema = z.object({
  path: workspacePathSchema,
  offset: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(2_000).optional(),
});

export const workspaceWriteInputSchema = z.object({
  path: workspacePathSchema,
  content: z.string().max(1_000_000),
});

export const workspaceEditInputSchema = z.object({
  path: workspacePathSchema,
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1).max(200_000),
        newText: z.string().max(200_000),
      }),
    )
    .min(1)
    .max(100),
});

export const workspaceBashInputSchema = z.object({
  command: z.string().trim().min(1).max(100_000),
  timeoutMs: z.number().int().min(250).max(120_000).default(15_000),
});

export type WorkspaceReadInput = z.infer<typeof workspaceReadInputSchema>;
export type WorkspaceWriteInput = z.infer<typeof workspaceWriteInputSchema>;
export type WorkspaceEditInput = z.infer<typeof workspaceEditInputSchema>;
export type WorkspaceBashInput = z.infer<typeof workspaceBashInputSchema>;
