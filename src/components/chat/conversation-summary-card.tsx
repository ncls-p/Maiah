"use client";

import { BrainCircuitIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChatMarkdown } from "@/components/chat/chat-markdown";

export function ConversationSummaryCard({ summary }: { summary: string }) {
  const t = useTranslations("chat.memory");
  return (
    <aside
      className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-3.5 shadow-[0_10px_30px_-24px_var(--primary)]"
      aria-label={t("title")}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
          <BrainCircuitIcon className="size-3.5" aria-hidden="true" />
        </span>
        {t("title")}
      </div>
      <div className="text-sm leading-6 text-muted-foreground">
        <ChatMarkdown>{summary}</ChatMarkdown>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground/80">
        {t("description")}
      </p>
    </aside>
  );
}
