import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { approvalSources } from "./model-advanced-fields.approval-risk-levels";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm } from "./types";
export function ModelAdvancedMainSection9({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-approval-sources"
        help={t("approvalSourcesHelp")}
      >
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
            <SelectItem value="custom,mcp">{t("sourceCustomMcp")}</SelectItem>
            <SelectItem value="mcp">{t("sourceMcp")}</SelectItem>
            <SelectItem value={approvalSources.join(",")}>
              {t("sourceAll")}
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}
