import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm } from "./types";
export function ModelAdvancedMainSection11({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-approval-mode" help={t("approvalPolicyHelp")}>
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
  );
}
