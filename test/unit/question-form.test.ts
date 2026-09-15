import { streamText, tool, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  toolCallStream,
  textStream,
} from "./workflow-agentic-route.suite-4.fixture";
import { describe, expect, it } from "vitest";
import {
  questionFormInput,
  isQuestionForm,
  formatQuestionAnswers,
  stopForQuestionForm,
} from "@/modules/question-form/contracts";
import { questionFormTool } from "@/modules/question-form/tool";
import { builtInToolInputSchemaJson } from "@/modules/tool/builtin-tool-json-schema.built-in-tool-input-schema-json";
const id = "00000000-0000-4000-8000-000000000001";
const form = {
  title: "Your project",
  questions: [
    { id: "name", label: "Name", type: "text" as const, required: true },
    {
      id: "choices",
      label: "Features",
      type: "multiple-choice" as const,
      required: true,
      options: [
        { value: "a", label: "Search" },
        { value: "b", label: "Images" },
      ],
    },
  ],
};
const output = {
  kind: "question_form" as const,
  version: 1 as const,
  id,
  conversationId: id,
  form,
};
describe("custom question forms", () => {
  it("does not ask the model to continue before the user answers", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls++;
        return calls === 1
          ? toolCallStream("form-call", "ask_question_form", form)
          : textStream("Should wait for user");
      },
    });
    const result = streamText({
      model,
      prompt: "Ask me about my project",
      tools: {
        ask_question_form: tool({
          inputSchema: questionFormInput,
          execute: async (input) =>
            questionFormTool.execute(input, {
              workspaceId: id,
              userId: id,
              conversationId: id,
              messageId: id,
              interactiveChat: true,
            }),
        }),
      },
      stopWhen: [stopForQuestionForm, isStepCount(3)],
    });
    await result.consumeStream();
    expect(calls).toBe(1);
    expect((await result.steps)[0].toolResults[0].output).toMatchObject({
      kind: "question_form",
      conversationId: id,
    });
  });
  it("registers a JSON-compatible schema and produces a bounded interactive result", async () => {
    expect(builtInToolInputSchemaJson(questionFormTool.name)).toHaveProperty(
      "properties.questions",
    );
    const result = await questionFormTool.execute(form, {
      workspaceId: id,
      userId: id,
      conversationId: id,
      messageId: id,
      interactiveChat: true,
    });
    expect(isQuestionForm(result)).toBe(true);
    expect(() =>
      questionFormTool.execute(form, { workspaceId: id, userId: id }),
    ).toThrow("QUESTION_FORM_INTERACTIVE_ONLY");
  });
  it("rejects duplicate IDs, empty choices and excessive questions", () => {
    expect(
      questionFormInput.safeParse({
        ...form,
        questions: [form.questions[0], form.questions[0]],
      }).success,
    ).toBe(false);
    expect(
      questionFormInput.safeParse({
        ...form,
        questions: [{ ...form.questions[1], options: undefined }],
      }).success,
    ).toBe(false);
    expect(
      questionFormInput.safeParse({
        ...form,
        questions: Array.from({ length: 13 }, (_, i) => ({
          ...form.questions[0],
          id: `q${i}`,
        })),
      }).success,
    ).toBe(false);
  });
  it("ends the turn only after a valid form output in the latest step", () => {
    expect(
      stopForQuestionForm({ steps: [{ toolResults: [{ output }] }] }),
    ).toBe(true);
    expect(
      stopForQuestionForm({
        steps: [{ toolResults: [{ output }] }, { toolResults: [] }],
      }),
    ).toBe(false);
    expect(
      stopForQuestionForm({
        steps: [{ toolResults: [{ output: { error: "failure" } }] }],
      }),
    ).toBe(false);
    expect(stopForQuestionForm({ steps: [] })).toBe(false);
  });
  it("validates optional numbers and real calendar dates, including reserved object keys", () => {
    const value = {
      ...output,
      form: {
        title: "Schedule",
        questions: [
          {
            id: "constructor",
            label: "Size",
            type: "number" as const,
            required: false,
          },
          { id: "when", label: "Date", type: "date" as const, required: false },
        ],
      },
    };
    expect(formatQuestionAnswers(value, {})).toContain("Size: —");
    expect(
      formatQuestionAnswers(value, { constructor: "0", when: "2028-02-29" }),
    ).toContain("Size: 0");
    expect(() =>
      formatQuestionAnswers(value, { constructor: "Infinity" }),
    ).toThrow("Size");
    expect(() => formatQuestionAnswers(value, { when: "2026-02-31" })).toThrow(
      "Date",
    );
  });
  it("formats real option labels and rejects missing or fabricated answers", () => {
    expect(
      formatQuestionAnswers(output, { name: "Ada", choices: ["a", "b"] }),
    ).toBe("Your project\n\nName: Ada\n\nFeatures: Search, Images");
    expect(() =>
      formatQuestionAnswers(output, { name: "", choices: ["a"] }),
    ).toThrow("Name");
    expect(() =>
      formatQuestionAnswers(output, { name: "Ada", choices: ["evil"] }),
    ).toThrow("Features");
    expect(() =>
      formatQuestionAnswers(output, { name: "x".repeat(4001), choices: ["a"] }),
    ).toThrow();
  });
});
