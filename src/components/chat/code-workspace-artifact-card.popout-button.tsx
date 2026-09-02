import { ExternalLinkIcon } from "lucide-react";
import type { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUTTON_TYPE,
  COMPACT_ICON_CLASS,
  GHOST_VARIANT,
  OUTLINE_VARIANT,
} from "./code-workspace-artifact-card.button-type";

export function CodeWorkspacePanesHidden({
  onShowAll,
  t,
}: {
  onShowAll: () => void;
  t: ReturnType<typeof useTranslations<"chat.artifacts">>;
}) {
  return (
    <div className="flex min-h-80 items-center justify-center p-6 text-center">
      <div className="max-w-xs rounded-2xl border border-border/60 bg-muted/20 p-5 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {t("allWorkspacePanesHidden")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("allWorkspacePanesHiddenDescription")}
        </p>
        <Button
          className="mt-4 h-10 rounded-xl"
          onClick={onShowAll}
          size="sm"
          type={BUTTON_TYPE}
          variant={OUTLINE_VARIANT}
        >
          {t("showAllWorkspacePanes")}
        </Button>
      </div>
    </div>
  );
}

export function CodeWorkspacePopoutButton({
  label,
  disabled,
  onClick,
  size = "compact",
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  size?: "compact" | "regular";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={BUTTON_TYPE}
          variant={GHOST_VARIANT}
          size="sm"
          className={
            size === "compact" ? "h-7 px-2 text-[11px]" : "h-9 px-2.5 text-xs"
          }
          data-slot="code-workspace-popout"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          <ExternalLinkIcon
            className={size === "compact" ? COMPACT_ICON_CLASS : "size-3.5"}
            aria-hidden="true"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
