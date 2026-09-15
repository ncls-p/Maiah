"use client";

import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useIsFrench } from "@/lib/use-is-french";
import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import {
  formatQuestionAnswers,
  type QuestionForm,
} from "@/modules/question-form/contracts";

export const QuestionFormContext = createContext<{
  conversationId: string | null;
  enabled: boolean;
  submit: (content: string) => Promise<boolean>;
} | null>(null);

export function QuestionFormCard({ value }: { value: QuestionForm }) {
  const context = useContext(QuestionFormContext);
  const fr = useIsFrench();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled =
    context?.enabled && context.conversationId === value.conversationId;
  const update = (id: string, answer: string | string[]) =>
    setAnswers((current) => ({ ...current, [id]: answer }));
  return (
    <form
      className="space-y-4 rounded-xl border bg-background p-4"
      aria-label={value.form.title}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!enabled || pending || submitted) return;
        setError(null);
        setPending(true);
        try {
          const content = formatQuestionAnswers(value, answers);
          if (!(await context.submit(content)))
            throw new Error(
              fr
                ? "Les réponses n’ont pas pu être envoyées. Réessayez."
                : "Could not send answers. Please retry.",
            );
          setSubmitted(true);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <h3 className="font-semibold">{value.form.title}</h3>
        {value.form.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {value.form.description}
          </p>
        )}
      </div>
      <fieldset
        disabled={!enabled || pending || submitted}
        className="min-w-0 space-y-4"
      >
        {value.form.questions.map((q) => {
          const id = `question-${value.id}-${q.id}`;
          const helpId = `${id}-help`;
          const answer = Object.hasOwn(answers, q.id) ? answers[q.id] : "";
          const choice = q.type.endsWith("choice");
          return (
            <div key={q.id} className="space-y-2">
              {choice ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    {q.label}
                    {q.required ? " *" : ""}
                  </legend>
                  {q.options?.map((option) => {
                    const multiple = q.type === "multiple-choice";
                    const checked = multiple
                      ? Array.isArray(answer) && answer.includes(option.value)
                      : answer === option.value;
                    return (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          className="mt-1"
                          type={multiple ? "checkbox" : "radio"}
                          name={id}
                          value={option.value}
                          checked={checked}
                          required={!multiple && q.required}
                          aria-describedby={q.help ? helpId : undefined}
                          onChange={(event) =>
                            update(
                              q.id,
                              multiple
                                ? event.target.checked
                                  ? [
                                      ...(Array.isArray(answer) ? answer : []),
                                      option.value,
                                    ]
                                  : (Array.isArray(answer)
                                      ? answer
                                      : []
                                    ).filter((v) => v !== option.value)
                                : option.value,
                            )
                          }
                        />
                        <span className="min-w-0 break-words">
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <>
                  <label htmlFor={id} className="text-sm font-medium">
                    {q.label}
                    {q.required ? " *" : ""}
                  </label>
                  {q.type === "textarea" ? (
                    <Textarea
                      id={id}
                      value={String(answer)}
                      required={q.required}
                      maxLength={4000}
                      aria-describedby={q.help ? helpId : undefined}
                      onChange={(e) => update(q.id, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={q.type}
                      step={q.type === "number" ? "any" : undefined}
                      value={String(answer)}
                      required={q.required}
                      maxLength={4000}
                      aria-describedby={q.help ? helpId : undefined}
                      onChange={(e) => update(q.id, e.target.value)}
                    />
                  )}
                </>
              )}
              {q.help && (
                <p id={helpId} className="text-xs text-muted-foreground">
                  {q.help}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}
          <ErrorDetailsButton />
        </div>
      )}
      {submitted ? (
        <div className="flex items-center gap-3">
          <p role="status" className="text-sm">
            {fr ? "Réponses envoyées" : "Answers sent"}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!enabled}
            onClick={() => setSubmitted(false)}
          >
            {fr ? "Modifier" : "Edit"}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={!enabled || pending}>
          {pending
            ? fr
              ? "Envoi…"
              : "Sending…"
            : fr
              ? "Envoyer les réponses"
              : "Send answers"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {fr
          ? "Vous pouvez aussi répondre directement dans la conversation."
          : "You can also answer directly in the conversation."}
      </p>
    </form>
  );
}
