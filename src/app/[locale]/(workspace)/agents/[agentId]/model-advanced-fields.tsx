"use client";

import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";

import type { AgentForm } from "./types";
import { defaultGenParams } from "./types";

const approvalRiskLevels = ["low", "medium", "high", "critical"] as const;
const approvalSources = ["builtin", "custom", "mcp"] as const;

function parseTextList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ModelAdvancedFields({
  form,
  setFormAction: setForm,
  onResetAction: onReset,
}: {
  form: AgentForm;
  setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
  onResetAction?: () => void;
}) {
  const t = useTranslations("agents.model");

  function updateApprovalPolicy(patch: Partial<AgentForm["approvalPolicy"]>) {
    setForm((prev) => ({
      ...prev,
      approvalPolicy: {
        ...prev.approvalPolicy,
        ...patch,
      },
    }));
  }

  function resetGenParams() {
    setForm((prev) => ({
      ...prev,
      temperature: defaultGenParams.temperature,
      topP: defaultGenParams.topP,
      maxOutputTokens: defaultGenParams.maxOutputTokens,
      maxToolCalls: defaultGenParams.maxToolCalls,
      toolChoice: "auto",
      generationSettings: {
        topK: "",
        presencePenalty: "",
        frequencyPenalty: "",
        seed: "",
        maxRetries: "",
        stopSequences: "",
      },
      responseFormat: "text",
    }));
    onReset?.();
  }

  return (
    <div className="space-y-4">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="agent-temperature">
            {t("temperature")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, temperature: e.target.value }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-top-p">{t("topP")}</FieldLabel>
          <FieldContent>
            <Input
              id="agent-top-p"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={form.topP}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, topP: e.target.value }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-max-output">
            {t("maxOutputTokens")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-max-output"
              type="number"
              min={1}
              max={agentRuntimePolicy.maxOutputTokens}
              value={form.maxOutputTokens}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  maxOutputTokens: e.target.value,
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-max-tool-calls">
            {t("maxToolCalls")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-max-tool-calls"
              type="number"
              min={0}
              max={agentRuntimePolicy.maxToolCalls}
              value={form.maxToolCalls}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  maxToolCalls: e.target.value,
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-tool-choice">{t("toolChoice")}</FieldLabel>
          <FieldContent>
            <Select
              value={form.toolChoice}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  toolChoice: value as AgentForm["toolChoice"],
                }))
              }
            >
              <SelectTrigger id="agent-tool-choice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("toolChoiceAuto")}</SelectItem>
                <SelectItem value="required">
                  {t("toolChoiceRequired")}
                </SelectItem>
                <SelectItem value="none">{t("toolChoiceNone")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-response-format">
            {t("responseFormat")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={form.responseFormat}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  responseFormat: value as AgentForm["responseFormat"],
                }))
              }
            >
              <SelectTrigger id="agent-response-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{t("responseText")}</SelectItem>
                <SelectItem value="json_object">{t("responseJson")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-approval-mode">
            {t("approvalPolicy")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={
                form.approvalPolicy.requireApprovalForAllTools
                  ? "all"
                  : (form.approvalPolicy.defaultDecision ?? "allow")
              }
              onValueChange={(value) => {
                if (value === "all") {
                  updateApprovalPolicy({
                    requireApprovalForAllTools: true,
                    defaultDecision: "allow",
                  });
                  return;
                }
                updateApprovalPolicy({
                  requireApprovalForAllTools: false,
                  defaultDecision: value as NonNullable<
                    AgentForm["approvalPolicy"]["defaultDecision"]
                  >,
                });
              }}
            >
              <SelectTrigger id="agent-approval-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">{t("approvalAllow")}</SelectItem>
                <SelectItem value="require_approval">
                  {t("approvalDefault")}
                </SelectItem>
                <SelectItem value="deny">{t("approvalDeny")}</SelectItem>
                <SelectItem value="all">{t("approvalAll")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-approval-risk-levels">
            {t("approvalRiskLevels")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={
                (
                  form.approvalPolicy.requireApprovalRiskLevels ?? [
                    "high",
                    "critical",
                  ]
                ).join(",") || "none"
              }
              onValueChange={(value) =>
                updateApprovalPolicy({
                  requireApprovalRiskLevels:
                    value === "none"
                      ? []
                      : (value
                          .split(",")
                          .filter(
                            Boolean,
                          ) as AgentForm["approvalPolicy"]["requireApprovalRiskLevels"]),
                })
              }
            >
              <SelectTrigger id="agent-approval-risk-levels" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high,critical">
                  {t("riskHighCritical")}
                </SelectItem>
                <SelectItem value="medium,high,critical">
                  {t("riskMediumAndAbove")}
                </SelectItem>
                <SelectItem value={approvalRiskLevels.join(",")}>
                  {t("riskAll")}
                </SelectItem>
                <SelectItem value="none">{t("riskNone")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-approval-sources">
            {t("approvalSources")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={
                (form.approvalPolicy.requireApprovalSources ?? []).join(",") ||
                "none"
              }
              onValueChange={(value) =>
                updateApprovalPolicy({
                  requireApprovalSources:
                    value === "none"
                      ? []
                      : (value
                          .split(",")
                          .filter(
                            Boolean,
                          ) as AgentForm["approvalPolicy"]["requireApprovalSources"]),
                })
              }
            >
              <SelectTrigger id="agent-approval-sources" className="w-full">
                <SelectValue placeholder={t("sourceDefault")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("sourceDefault")}</SelectItem>
                <SelectItem value="custom,mcp">
                  {t("sourceCustomMcp")}
                </SelectItem>
                <SelectItem value="mcp">{t("sourceMcp")}</SelectItem>
                <SelectItem value={approvalSources.join(",")}>
                  {t("sourceAll")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="agent-approval-tool-names">
            {t("alwaysApproveTools")}
          </FieldLabel>
          <FieldContent>
            <Textarea
              id="agent-approval-tool-names"
              placeholder={t("oneToolPerLine")}
              value={(form.approvalPolicy.requireApprovalToolNames ?? []).join(
                "\n",
              )}
              onChange={(e) =>
                updateApprovalPolicy({
                  requireApprovalToolNames: parseTextList(e.target.value),
                })
              }
            />
          </FieldContent>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="agent-denied-tool-names">
            {t("deniedTools")}
          </FieldLabel>
          <FieldContent>
            <Textarea
              id="agent-denied-tool-names"
              placeholder={t("oneToolPerLine")}
              value={(form.approvalPolicy.denyToolNames ?? []).join("\n")}
              onChange={(e) =>
                updateApprovalPolicy({
                  denyToolNames: parseTextList(e.target.value),
                })
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-memory-enabled">{t("memory")}</FieldLabel>
          <FieldContent>
            <Select
              value={form.memoryPolicy.enabled ? "enabled" : "disabled"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  memoryPolicy: {
                    ...prev.memoryPolicy,
                    enabled: value === "enabled",
                  },
                }))
              }
            >
              <SelectTrigger id="agent-memory-enabled" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">{t("memoryDisabled")}</SelectItem>
                <SelectItem value="enabled">{t("memoryEnabled")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-memory-max-messages">
            {t("memoryMaxMessages")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-memory-max-messages"
              type="number"
              min={1}
              value={form.memoryPolicy.maxMessages}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  memoryPolicy: {
                    ...prev.memoryPolicy,
                    maxMessages: Number(e.target.value) || 1,
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-top-k">{t("topK")}</FieldLabel>
          <FieldContent>
            <Input
              id="agent-top-k"
              type="number"
              min={1}
              placeholder={t("providerDefault")}
              value={form.generationSettings.topK}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  generationSettings: {
                    ...prev.generationSettings,
                    topK: e.target.value,
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-presence-penalty">
            {t("presencePenalty")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-presence-penalty"
              type="number"
              min={-1}
              max={1}
              step={0.1}
              placeholder={t("providerDefault")}
              value={form.generationSettings.presencePenalty}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  generationSettings: {
                    ...prev.generationSettings,
                    presencePenalty: e.target.value,
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-frequency-penalty">
            {t("frequencyPenalty")}
          </FieldLabel>
          <FieldContent>
            <Input
              id="agent-frequency-penalty"
              type="number"
              min={-1}
              max={1}
              step={0.1}
              placeholder={t("providerDefault")}
              value={form.generationSettings.frequencyPenalty}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  generationSettings: {
                    ...prev.generationSettings,
                    frequencyPenalty: e.target.value,
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-guardrails-enabled">
            {t("guardrails")}
          </FieldLabel>
          <FieldContent>
            <Select
              value={form.guardrails.enabled ? "enabled" : "disabled"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  guardrails: {
                    ...prev.guardrails,
                    enabled: value === "enabled",
                  },
                }))
              }
            >
              <SelectTrigger id="agent-guardrails-enabled" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">
                  {t("guardrailsDisabled")}
                </SelectItem>
                <SelectItem value="enabled">
                  {t("guardrailsEnabled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="agent-guardrail-topics">
            {t("blockedTopics")}
          </FieldLabel>
          <FieldContent>
            <Textarea
              id="agent-guardrail-topics"
              placeholder={t("oneTopicPerLine")}
              value={form.guardrails.blockedTopics.join("\n")}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  guardrails: {
                    ...prev.guardrails,
                    blockedTopics: e.target.value
                      .split(/\n|,/)
                      .map((topic) => topic.trim())
                      .filter(Boolean),
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="agent-stop-sequences">
            {t("stopSequences")}
          </FieldLabel>
          <FieldContent>
            <Textarea
              id="agent-stop-sequences"
              placeholder={t("oneSequencePerLine")}
              value={form.generationSettings.stopSequences}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  generationSettings: {
                    ...prev.generationSettings,
                    stopSequences: e.target.value,
                  },
                }))
              }
            />
          </FieldContent>
        </Field>
      </FieldGroup>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="px-0 text-xs"
        onClick={resetGenParams}
      >
        <RefreshCwIcon className="size-3" aria-hidden="true" />
        {t("resetDefaults")}
      </Button>
    </div>
  );
}
