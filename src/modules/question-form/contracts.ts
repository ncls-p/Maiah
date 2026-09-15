import { z } from "zod";

const option = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
});
export const questionFormInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(1000).optional(),
    questions: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/),
          label: z.string().trim().min(1).max(300),
          help: z.string().max(500).optional(),
          type: z.enum([
            "text",
            "textarea",
            "single-choice",
            "multiple-choice",
            "number",
            "date",
          ]),
          required: z.boolean(),
          options: z.array(option).min(1).max(20).optional(),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((form, ctx) => {
    if (new Set(form.questions.map((q) => q.id)).size !== form.questions.length)
      ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
    for (const q of form.questions) {
      if (q.type.endsWith("choice") && !q.options?.length)
        ctx.addIssue({
          code: "custom",
          message: "Choice questions require options",
        });
      if (
        q.options &&
        new Set(q.options.map((o) => o.value)).size !== q.options.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Option values must be unique",
        });
    }
  });
export const questionFormOutput = z.object({
  kind: z.literal("question_form"),
  version: z.literal(1),
  id: z.uuid(),
  conversationId: z.uuid(),
  form: questionFormInput,
});
export type QuestionForm = z.infer<typeof questionFormOutput>;
export const QUESTION_FORM_TOOL = {
  id: "00000000-0000-4000-8000-000000000202",
  name: "ask_question_form",
  displayName: "Question form",
  description:
    "Display a custom form in the chat to ask the user for information. Supports text, choices, numbers and dates. The turn ends after displaying it; wait for the user's answers. Only available in interactive chat. Never request passwords, tokens or other secrets.",
  category: "Create",
  riskLevel: "low" as const,
};
export function isQuestionForm(value: unknown): value is QuestionForm {
  return questionFormOutput.safeParse(value).success;
}
export function stopForQuestionForm({
  steps,
}: {
  steps: Array<{ toolResults: Array<{ output: unknown }> }>;
}) {
  return (
    steps.at(-1)?.toolResults.some((result) => isQuestionForm(result.output)) ??
    false
  );
}
export function formatQuestionAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
): string {
  const rows = form.form.questions.map((q) => {
    const raw = Object.hasOwn(answers, q.id) ? answers[q.id] : "";
    const values = Array.isArray(raw) ? raw : raw.trim() ? [raw.trim()] : [];
    if (q.required && !values.length) throw new Error(q.label);
    if (values.some((v) => v.length > 4000)) throw new Error(q.label);
    if (
      q.type.endsWith("choice") &&
      values.some((v) => !q.options?.some((o) => o.value === v))
    )
      throw new Error(q.label);
    if (q.type !== "multiple-choice" && values.length > 1)
      throw new Error(q.label);
    if (q.type === "number" && values.some((v) => !Number.isFinite(Number(v))))
      throw new Error(q.label);
    if (
      q.type === "date" &&
      values.some(
        (v) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v,
      )
    )
      throw new Error(q.label);
    return `${q.label}: ${values.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(", ") || "—"}`;
  });
  return `${form.form.title}\n\n${rows.join("\n\n")}`;
}
