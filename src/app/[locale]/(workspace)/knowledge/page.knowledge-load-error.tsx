import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";

export function KnowledgeLoadError() {
  const t = useTranslations("knowledge");
  return (
    <WorkspacePage title={t("orbitTitle")} accentTitle={t("orbitAccent")} eyebrow={t("orbitEyebrow")} description={t("orbitDescription")} width="wide">
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5" role="alert">
        <h2 className="text-base font-semibold">{t("loadErrorTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("loadErrorDescription")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>{t("retry")}</Button>
      </div>
    </WorkspacePage>
  );
}
