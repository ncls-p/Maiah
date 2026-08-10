import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";
import type { KnowledgePageViewModel } from "./page.knowledge-page.view";
import { KnowledgeDocumentListSection1 } from "./page.knowledge-page.view.branch-1.section-4.branch-1.section-1";

export function KnowledgeDocumentsBranch1({
  model,
}: {
  model: KnowledgePageViewModel;
}) {
  const { query, results, search, setQuery, t } = model;
  return (
    <>
      <KnowledgeDocumentListSection1 model={model} />
      <AdvancedSection
        label={t("optionalSearch")}
        hint={t("optionalSearchHint")}
        storageKey="advanced:knowledge-search"
      >
        <div className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label={t("searchAriaLabel")}
              name="knowledge-search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
            <Button onClick={() => void search()}>
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              {t("search")}
            </Button>
          </div>
          {results.map((result) => (
            <div key={result.chunkId} className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{result.documentTitle}</p>
              <p className="mt-1 line-clamp-4 text-muted-foreground">
                {result.content}
              </p>
            </div>
          ))}
        </div>
      </AdvancedSection>
    </>
  );
}
