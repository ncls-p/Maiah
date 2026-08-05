import { Field,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { WORKFLOW_NODE_CATEGORIES,type WorkflowNodeCategory } from "@/modules/workflows/catalog";

import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder.view";
import { workflowNodeIconByType } from "./workflow-canvas-node";
export function useWorkflowPaletteRenderer(model: WorkflowBuilderViewModel) {
  const { addNode, filteredCatalog, manualTriggerExists, paletteCategory, paletteSearch, setPaletteCategory, setPaletteSearch, t } = model;
  function renderPalette(suffix: string) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-muted/20">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("palette")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("paletteHint")}</p>
          </div>
          <FieldGroup className="gap-2">
            <Field>
              <FieldLabel htmlFor={`workflow-node-search-${suffix}`} className="sr-only">
                {t("searchNodes")}
              </FieldLabel>
              <Input id={`workflow-node-search-${suffix}`} value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={t("searchNodes")} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`workflow-node-category-${suffix}`} className="sr-only">
                {t("category")}
              </FieldLabel>
              <Select value={paletteCategory} onValueChange={(value) => setPaletteCategory(value as WorkflowNodeCategory)}>
                <SelectTrigger id={`workflow-node-category-${suffix}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {WORKFLOW_NODE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`categories.${category}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
          <div className="flex flex-col gap-2">
            {filteredCatalog.map((item) => {
              const Icon = workflowNodeIconByType[item.type];
              const disabled = item.type === "trigger.manual" && manualTriggerExists;
              return (
                <button key={item.type} type="button" disabled={disabled} onClick={() => addNode(item.type)} className="group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-[background-color,border-color,scale] duration-150 ease-out hover:border-foreground/25 hover:bg-accent active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{t(`nodes.${item.type}`)}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{t(`nodeDescriptions.${item.type}`)}</span>
                  </span>
                </button>
              );
            })}
            {filteredCatalog.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{t("noNodeResults")}</p> : null}
          </div>
        </ScrollArea>
      </div>
    );
  }
  return renderPalette;
}
