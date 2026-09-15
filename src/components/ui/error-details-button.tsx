"use client";
import { useIsFrench } from "@/lib/use-is-french";
import { createErrorReport, showErrorReport } from "@/lib/error-report";
export function ErrorDetailsButton() {
  const french = useIsFrench();
  return (
    <button
      type="button"
      className="ml-2 inline-flex min-h-8 items-center text-xs font-medium underline underline-offset-4"
      onClick={(event) => {
        const container = event.currentTarget.closest('[role="alert"]');
        showErrorReport(
          createErrorReport(container?.textContent ?? "UI error"),
        );
      }}
    >
      {french ? "Détails de l’erreur" : "Error details"}
    </button>
  );
}
