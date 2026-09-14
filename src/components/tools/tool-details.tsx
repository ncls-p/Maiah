"use client";

import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToolPayloadViewer } from "./tool-payload-viewer";

export function ToolDetails({
  name,
  description,
  inputSchema,
  outputSchema,
  requireApproval,
}: {
  name: string;
  description: string | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  requireApproval: boolean;
}) {
  const t = useTranslations("toolDetails");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("inspect", { name })}
        >
          <InfoIcon className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-words">{name}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {description || t("noDescription")}
        </p>
        <p className="rounded-lg bg-muted/40 p-3 text-sm">
          {requireApproval ? t("approvalRequired") : t("approvalPolicy")}
        </p>
        {inputSchema ? (
          <ToolPayloadViewer label={t("inputSchema")} value={inputSchema} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noInputSchema")}</p>
        )}
        {outputSchema ? (
          <ToolPayloadViewer label={t("outputSchema")} value={outputSchema} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noOutputSchema")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
