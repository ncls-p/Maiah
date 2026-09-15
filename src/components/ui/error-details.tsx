"use client";
import { NextIntlClientProvider } from "next-intl";
import { useIsFrench } from "@/lib/use-is-french";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { formatErrorReport, type ErrorReport } from "@/lib/error-report";
export function ErrorDetails() {
  const [report, setReport] = useState<ErrorReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => {
      setReport((event as CustomEvent<ErrorReport>).detail);
      setCopied(false);
      setCopyFailed(false);
    };
    window.addEventListener("maiah:error-details", listener);
    return () => window.removeEventListener("maiah:error-details", listener);
  }, []);
  const french = useIsFrench();
  if (!report) return null;
  return (
    <NextIntlClientProvider
      locale={french ? "fr" : "en"}
      timeZone="UTC"
      messages={{ common: { close: french ? "Fermer" : "Close" } }}
    >
      <Dialog
        open={report !== null}
        onOpenChange={(open) => {
          if (!open) setReport(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {french ? "Détails de l’erreur" : "Error details"}
            </DialogTitle>
            <DialogDescription>
              {french
                ? "Copiez ces informations pour les transmettre aux développeurs."
                : "Copy this information to share it with developers."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label={french ? "Rapport d’erreur" : "Error report"}
            readOnly
            value={report ? formatErrorReport(report) : ""}
            className="min-h-56 w-full rounded border p-3 font-mono text-xs"
          />
          <Button
            onClick={async () => {
              if (!report) return;
              try {
                await navigator.clipboard.writeText(formatErrorReport(report));
                setCopied(true);
                setCopyFailed(false);
              } catch {
                setCopyFailed(true);
              }
            }}
          >
            {copied
              ? french
                ? "Copié"
                : "Copied"
              : french
                ? "Copier les détails"
                : "Copy details"}
          </Button>
          {copyFailed ? (
            <p role="status" className="text-sm">
              {french
                ? "Copie indisponible. Sélectionnez le rapport et copiez-le manuellement."
                : "Clipboard unavailable. Select the report and copy it manually."}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>
  );
}
