import { z } from "zod";
export const pageContextSchema = z.object({
  path: z.string().max(2000),
  title: z.string().max(300),
  text: z.string().max(12000).optional(),
  cursor: z
    .object({
      x: z.number(),
      y: z.number(),
      target: z.string().max(100).nullable(),
    })
    .nullable(),
  focus: z.string().max(100).nullable(),
  elements: z
    .array(
      z.object({
        id: z.string().max(100),
        tag: z.string().max(30),
        role: z.string().max(60),
        label: z.string().max(300),
        value: z.string().max(2000).optional(),
        disabled: z.boolean(),
      }),
    )
    .max(150),
  headings: z.array(z.string().max(300)).max(30),
});
export type PageContext = z.infer<typeof pageContextSchema>;
export const uiActionSchema = z.object({
  action: z.enum(["click", "fill", "navigate", "refresh"]),
  target: z.string().max(100).optional(),
  value: z.string().max(2000).optional(),
  path: z.string().max(2000),
});
export type UiAction = z.infer<typeof uiActionSchema>;
export type CompanionCommand = {
  id: string;
  action: UiAction;
  createdAt: number;
};
export type CompanionState = {
  enabled: boolean;
  agentId: string | null;
  name: string | null;
  organizationId: string;
  available: boolean;
};
export const SENSITIVE_FIELD =
  /password|passwd|secret|token|api.?key|credential|authorization|credit.?card|card.?number|cvv|cvc|iban|mot.?de.?passe|clé.?api|cle.?api/i;
