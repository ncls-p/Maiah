import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";

import { approvalRiskLevels } from "./model-advanced-fields.approval-risk-levels";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm } from "./types";
export function ModelAdvancedMainSection10({ model }: { model: ModelAdvancedFieldsViewModel }) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-approval-risk-levels" help={t("approvalRiskLevelsHelp")}>
        {t("approvalRiskLevels")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={(form.approvalPolicy.requireApprovalRiskLevels ?? ["high", "critical"]).join(",") || "none"}
          onValueChange={(value) =>
            updateApprovalPolicy({
              requireApprovalRiskLevels: value === "none" ? [] : (value.split(",").filter(Boolean) as AgentForm["approvalPolicy"]["requireApprovalRiskLevels"]),
            })
          }
        >
          <SelectTrigger id="agent-approval-risk-levels" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high,critical">{t("riskHighCritical")}</SelectItem>
            <SelectItem value="medium,high,critical">{t("riskMediumAndAbove")}</SelectItem>
            <SelectItem value={approvalRiskLevels.join(",")}>{t("riskAll")}</SelectItem>
            <SelectItem value="none">{t("riskNone")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}
