import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RagConfigFieldsViewModel } from "./page.rag-config-fields.view";
export function RagConfigFieldsSection3({ model }: { model: RagConfigFieldsViewModel }) {
  const { config, idPrefix, onChange, t } = model;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(
        [
          ["ragChunkSize", "maxCharacters", config.chunking.maxCharacters],
          ["ragChunkOverlap", "overlapCharacters", config.chunking.overlapCharacters],
          ["ragCandidates", "candidateCount", config.retrieval.candidateCount],
          ["ragResults", "resultCount", config.retrieval.resultCount],
          ["ragMinimumScore", "minimumScore", config.retrieval.minimumScore],
        ] as const
      ).map(([label, key, value]) => (
        <div className="grid min-w-0 gap-1.5" key={key}>
          <Label htmlFor={`${idPrefix}-${key}`} help={t(`${label}Help`)}>
            {t(label)}
          </Label>
          <Input
            id={`${idPrefix}-${key}`}
            type="number"
            min={key === "minimumScore" ? -1 : key === "overlapCharacters" ? 0 : 1}
            max={key === "minimumScore" ? 1 : undefined}
            step={key === "minimumScore" ? 0.01 : 1}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onChange(
                key === "maxCharacters" || key === "overlapCharacters"
                  ? {
                      ...config,
                      chunking: { ...config.chunking, [key]: next },
                    }
                  : {
                      ...config,
                      retrieval: { ...config.retrieval, [key]: next },
                    },
              );
            }}
          />
        </div>
      ))}
    </div>
  );
}
