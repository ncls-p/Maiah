import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { Link } from "@/i18n/navigation";

export function AgentConfigureLoadError({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("agents");
  return (
    <WorkspacePage
      title={t("configurePage.loadErrorTitle")}
      description={t("configurePage.loadErrorDescription")}
      width="narrow"
    >
      <div
        className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">
          {message ?? t("configurePage.loadErrorDescription")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onRetry}>
            {t("configurePage.retry")}
          </Button>
          <Button asChild type="button" size="sm" variant="outline">
            <Link href="/agents">{t("configurePage.back")}</Link>
          </Button>
        </div>
      </div>
    </WorkspacePage>
  );
}
