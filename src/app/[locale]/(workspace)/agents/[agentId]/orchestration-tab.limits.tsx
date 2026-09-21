"use client";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { useTranslations } from "next-intl";
import { policyField } from "./orchestration-tab.run-summary";
import type { OrchestrationPolicy } from "./types";
export function OrchestrationLimits({
  agentId,
  policy,
  setPolicyAction: setPolicy,
  disabled,
}: {
  agentId: string;
  policy: OrchestrationPolicy;
  setPolicyAction: (policy: OrchestrationPolicy) => void;
  disabled: boolean;
}) {
  const t = useTranslations("agents.orchestration");
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <AdvancedSection
        label={t("limitsTitle")}
        hint={t("limitsDescription")}
        storageKey={`advanced:orchestration:${agentId}`}
        className="mt-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policyField(
            policy,
            setPolicy,
            "maxDepth",
            t("maxDepth"),
            0,
            undefined,
            1,
            t("zeroUnlimited"),
          )}
          {policyField(
            policy,
            setPolicy,
            "maxDelegations",
            t("maxDelegations"),
            0,
            undefined,
            1,
            t("zeroUnlimited"),
          )}
          {policyField(
            policy,
            setPolicy,
            "maxParallel",
            t("maxParallel"),
            0,
            undefined,
            1,
            t("zeroUnlimited"),
          )}
          {policyField(
            policy,
            setPolicy,
            "maxChildSteps",
            t("maxChildSteps"),
            0,
            undefined,
            1,
            `${t("zeroUnlimited")} ${t("maxChildStepsDescription")}`,
          )}
          {policyField(
            policy,
            setPolicy,
            "maxTotalTokens",
            t("maxTotalTokens"),
            0,
            undefined,
            1000,
            `${t("tokenBudgetDescription")} ${t("zeroUnlimitedWithQuota")}`,
          )}
          {policyField(
            policy,
            setPolicy,
            "timeoutMs",
            t("timeoutMs"),
            0,
            undefined,
            1000,
            `${t("zeroUnlimited")} ${t("timeoutMsDescription")}`,
          )}
          {policyField(
            policy,
            setPolicy,
            "resultMaxChars",
            t("resultMaxChars"),
            0,
            undefined,
            1000,
            `${t("resultMaxCharsDescription")} ${t("zeroUnlimited")}`,
          )}
        </div>
      </AdvancedSection>
    </fieldset>
  );
}
