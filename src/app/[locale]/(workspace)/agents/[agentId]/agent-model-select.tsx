"use client";

import { ModelLogo } from "@/components/providers/model-logo";
import { ModelImpact } from "@/components/providers/model-impact";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Model, Provider } from "./types";

export function AgentModelSelect({
  value,
  onValueChange,
  filteredModels,
  providers,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  filteredModels: Model[];
  providers: Provider[];
  disabled: boolean;
}) {
  const selectedModel = filteredModels.find((model) => model.id === value);
  return (
    <>
      <Select
        value={value || "__none__"}
        onValueChange={(next) => onValueChange(next === "__none__" ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id="agent-model"
          className="w-full"
          aria-describedby={selectedModel ? "selected-model-impact" : undefined}
        >
          <SelectValue placeholder="—">
            {filteredModels.find((model) => model.id === value)?.displayName ??
              filteredModels.find((model) => model.id === value)?.modelId ??
              "—"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="w-[min(32rem,var(--radix-select-content-available-width))]"
        >
          <SelectGroup>
            <SelectItem value="__none__">—</SelectItem>
            {filteredModels.map((model) => {
              const modelLabel = model.displayName || model.modelId;
              return (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  textValue={modelLabel}
                  aria-label={modelLabel}
                  aria-labelledby={`model-option-name-${model.id}`}
                  aria-describedby={`model-option-impact-${model.id}`}
                  aria-description={[
                    providers.find(
                      (provider) => provider.id === model.providerId,
                    )?.name,
                    model.description,
                    model.tags?.join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <span className="flex items-center gap-2">
                    <ModelLogo
                      logoUrl={model.logoUrl}
                      label={modelLabel}
                      size="sm"
                    />
                    <span className="grid gap-1 text-left">
                      <span id={`model-option-name-${model.id}`}>
                        {modelLabel}
                      </span>
                      <ModelImpact
                        model={model}
                        id={`model-option-impact-${model.id}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {
                          providers.find(
                            (provider) => provider.id === model.providerId,
                          )?.name
                        }
                      </span>
                      {model.description ? (
                        <span className="max-w-sm whitespace-normal text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      ) : null}
                      {model.tags?.length ? (
                        <span className="flex flex-wrap gap-1">
                          {model.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-muted px-1.5 text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {selectedModel ? (
        <ModelImpact model={selectedModel} id="selected-model-impact" />
      ) : null}
    </>
  );
}
