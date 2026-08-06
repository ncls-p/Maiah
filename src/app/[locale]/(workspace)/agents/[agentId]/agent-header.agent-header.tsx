"use client";

import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon,CopyIcon,ImageOffIcon,MessageCircleIcon,MoreHorizontalIcon,Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DropdownMenu,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { AgentHeaderTitle,AgentLogoControls } from "./agent-header.agent-logo-controls";
import type { Agent,Model,Provider } from "./types";

function AgentHeaderActions({ agent, canEdit, hasModel, onClone, onShowDeleteDialog, onRemoveLogo, t }: { agent: Agent | null; canEdit: boolean; hasModel: boolean; onClone: () => void; onShowDeleteDialog: () => void; onRemoveLogo: () => void; t: ReturnType<typeof useTranslations<"agents">> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button asChild variant="ghost" size="icon" className="size-10">
        <Link href="/agents" aria-label={t("configurePage.back")}>
          <ArrowLeftIcon aria-hidden="true" />
        </Link>
      </Button>
      {hasModel && agent?.id ? (
        <Button asChild size="sm">
          <Link href={`/chat?agentId=${agent.id}`}>
            <MessageCircleIcon data-icon="inline-start" aria-hidden="true" />
            {t("chat")}
          </Link>
        </Button>
      ) : null}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10" aria-label={t("configurePage.actions")}>
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {canEdit && agent?.id && agent.canClone !== false ? (
                <DropdownMenuItem onClick={onClone}>
                  <CopyIcon aria-hidden="true" />
                  {t("list.clone")}
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                agent?.logoUrl ? (
                  <DropdownMenuItem onClick={onRemoveLogo}>
                    <ImageOffIcon aria-hidden="true" />
                    {t("configurePage.removeLogo")}
                  </DropdownMenuItem>
                ) : null
              ) : null}
              {canEdit ? (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onShowDeleteDialog}>
                  <Trash2Icon aria-hidden="true" />
                  {t("configurePage.delete")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function AgentHeader({ agent, providers, models, form, canEdit, onLogoChangeAction: onLogoChange, onCloneAction: onClone, onShowDeleteDialogAction: onShowDeleteDialog }: { agent: Agent | null; providers: Provider[]; models: Model[]; form: { providerId: string; modelId: string; name: string }; canEdit: boolean; onLogoChangeAction: (logoUrl: string | null) => void; onCloneAction: () => void; onShowDeleteDialogAction: () => void }) {
  const t = useTranslations("agents");
  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const selectedModel = models.find((m) => m.id === form.modelId);
  const selectedModelLabel = selectedModel?.displayName || selectedModel?.modelId;
  const agentLabel = agent?.name ?? form.name;
  const hasModel = Boolean(form.providerId && form.modelId);

  return (
    <div className="rounded-[1.125rem] border border-border/65 bg-card/85 p-3.5 shadow-[var(--surface-shadow)] sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <AgentLogoControls agent={agent} agentLabel={agentLabel} canEdit={canEdit} onLogoChange={onLogoChange} />
        <AgentHeaderTitle agent={agent} hasModel={hasModel} providerName={selectedProvider?.name} modelLabel={selectedModelLabel} t={t} />
        <AgentHeaderActions agent={agent} canEdit={canEdit} hasModel={hasModel} onClone={onClone} onShowDeleteDialog={onShowDeleteDialog} onRemoveLogo={() => onLogoChange(null)} t={t} />
      </div>
    </div>
  );
}
