"use client";
import { toast as sonnerToast } from "sonner";
import { createErrorReport, showErrorReport } from "./error-report";
const error: typeof sonnerToast.error = (message, options) => {
  const report = createErrorReport(
    typeof message === "string" ? message : "UI error",
  );
  const french =
    typeof window !== "undefined" && window.location.pathname.startsWith("/fr");
  return sonnerToast.error(message, {
    ...options,
    // Keep existing recovery actions; use the secondary action for diagnostics.
    ...(options?.action
      ? {
          cancel: {
            label: french ? "Détails" : "Details",
            onClick: () => showErrorReport(report),
          },
        }
      : {
          action: {
            label: french ? "Détails" : "Details",
            onClick: () => showErrorReport(report),
          },
        }),
  });
};
export const toast = Object.assign(
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  sonnerToast,
  { error },
);
