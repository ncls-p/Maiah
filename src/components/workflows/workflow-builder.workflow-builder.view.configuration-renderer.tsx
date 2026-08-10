import { SlidersHorizontalIcon, Trash2Icon } from "lucide-react";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { workflowNodeCatalogItem } from "@/modules/workflows/catalog";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
import { JsonValueEditor, WorkflowNodeFields } from "./workflow-node-fields";
export function useWorkflowConfigurationRenderer(
  model: WorkflowBuilderViewModel,
) {
  const {
    agents,
    removeSelectedNode,
    selectedNode,
    t,
    updateParameters,
    updateSelectedNode,
  } = model;
  function renderConfiguration(suffix: string) {
    if (!selectedNode) {
      return (
        <Empty className="m-4 min-h-56 p-5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SlidersHorizontalIcon />
            </EmptyMedia>
            <EmptyTitle>{t("noSelectionTitle")}</EmptyTitle>
            <EmptyDescription>{t("noSelection")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    const catalogItem = workflowNodeCatalogItem(selectedNode.data.workflowType);
    return (
      <div className="flex flex-col gap-5 p-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`workflow-node-label-${suffix}`}>
              {t("nodeName")}
            </FieldLabel>
            <Input
              id={`workflow-node-label-${suffix}`}
              value={selectedNode.data.label}
              onChange={(event) =>
                updateSelectedNode({ label: event.target.value })
              }
            />
          </Field>
        </FieldGroup>
        <WorkflowNodeFields
          nodeId={`${selectedNode.id}-${suffix}`}
          catalogItem={catalogItem}
          parameters={selectedNode.data.parameters}
          agents={agents}
          onChange={updateParameters}
        />
        <AdvancedSection
          label={t("expertSettings")}
          hint={t("expertSettingsHint")}
          icon={SlidersHorizontalIcon}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`workflow-timeout-${suffix}`}>
                {t("timeout")}
              </FieldLabel>
              <Input
                id={`workflow-timeout-${suffix}`}
                type="number"
                min={250}
                max={120000}
                value={selectedNode.data.settings.timeoutMs}
                onChange={(event) =>
                  updateSelectedNode({
                    settings: {
                      ...selectedNode.data.settings,
                      timeoutMs: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`workflow-retries-${suffix}`}>
                  {t("retries")}
                </FieldLabel>
                <Input
                  id={`workflow-retries-${suffix}`}
                  type="number"
                  min={0}
                  max={5}
                  value={selectedNode.data.settings.maxRetries}
                  onChange={(event) =>
                    updateSelectedNode({
                      settings: {
                        ...selectedNode.data.settings,
                        maxRetries: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`workflow-retry-delay-${suffix}`}>
                  {t("retryDelay")}
                </FieldLabel>
                <Input
                  id={`workflow-retry-delay-${suffix}`}
                  type="number"
                  min={0}
                  max={60000}
                  value={selectedNode.data.settings.retryDelayMs}
                  onChange={(event) =>
                    updateSelectedNode({
                      settings: {
                        ...selectedNode.data.settings,
                        retryDelayMs: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`workflow-raw-parameters-${suffix}`}>
                {t("parameters")}
              </FieldLabel>
              <JsonValueEditor
                key={`${selectedNode.id}:${JSON.stringify(selectedNode.data.parameters)}:${suffix}`}
                id={`workflow-raw-parameters-${suffix}`}
                value={selectedNode.data.parameters}
                onChange={(parameters) => {
                  if (
                    typeof parameters === "object" &&
                    parameters !== null &&
                    !Array.isArray(parameters)
                  ) {
                    updateSelectedNode({
                      parameters: parameters as Record<string, unknown>,
                    });
                  }
                }}
                className="min-h-40 font-mono text-xs"
              />
            </Field>
          </FieldGroup>
        </AdvancedSection>
        {selectedNode.data.workflowType !== "trigger.manual" ? (
          <Button variant="destructive" onClick={removeSelectedNode}>
            <Trash2Icon data-icon="inline-start" />
            {t("deleteNode")}
          </Button>
        ) : null}
      </div>
    );
  }
  return renderConfiguration;
}
