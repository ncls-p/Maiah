import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RagSettingsViewModel } from "./rag-settings.rag-settings.view";
export function RagSettingsFieldsSection3({ model }: { model: RagSettingsViewModel }) {
  const { numberValue, setSettings, settings, t } = model;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(
        [
          ["chunkSize", "maxCharacters", settings.chunking.maxCharacters],
          ["chunkOverlap", "overlapCharacters", settings.chunking.overlapCharacters],
          ["candidates", "candidateCount", settings.retrieval.candidateCount],
          ["results", "resultCount", settings.retrieval.resultCount],
        ] as const
      ).map(([label, key, value]) => (
        <div className="grid gap-1.5" key={key}>
          <Label htmlFor={`rag-${key}`} help={t(`${label}Help`)}>
            {t(label)}
          </Label>
          <Input
            id={`rag-${key}`}
            type="number"
            min={key === "overlapCharacters" ? 0 : 1}
            value={value}
            onChange={(event) => {
              const next = numberValue(event.target.value, value);
              setSettings(
                key === "maxCharacters" || key === "overlapCharacters"
                  ? {
                      ...settings,
                      chunking: { ...settings.chunking, [key]: next },
                    }
                  : {
                      ...settings,
                      retrieval: { ...settings.retrieval, [key]: next },
                    },
              );
            }}
          />
        </div>
      ))}
    </div>
  );
}
