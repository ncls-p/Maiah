import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChatAgent } from "@/components/chat/chat-types";
import { ModelLogo } from "@/components/providers/model-logo";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function AgentOption({
  agent,
  defaultLabel,
  onSelect,
}: {
  agent: ChatAgent;
  defaultLabel: string | null;
  onSelect: () => void;
}) {
  const t = useTranslations("chat");
  return (
    <DropdownMenuItem className="min-h-10 gap-2" onClick={onSelect}>
      <ModelLogo
        logoUrl={agent.logoUrl}
        label={agent.name}
        size="sm"
        imageFit="cover"
        className="rounded-full"
      />
      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
      {defaultLabel ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <StarIcon className="size-3" aria-hidden="true" />
          {defaultLabel}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {agent.modelDisplayName ? t("statusReady") : t("statusNeedsSetup")}
        </span>
      )}
    </DropdownMenuItem>
  );
}
