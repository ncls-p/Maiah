"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  partitionCodeSandboxFiles,
  type CodeSandboxOutput,
} from "@/components/chat/chat-message-rendering-utils";
import { SandboxOutputFileCard } from "./chat-artifact-renderers.sandbox-output-file-card";

/**
 * Files produced by a sandbox run, rendered outside the collapsed trace.
 * Only created or modified input files are shown (unchanged inputs stay in
 * the details). A failed run keeps its files visible and surfaces the failure
 * explicitly instead of hiding it.
 */
export function SandboxDeliverablesCard({
  result,
}: {
  result: CodeSandboxOutput;
}) {
  const t = useTranslations("chat.artifacts");
  const { outputFiles } = partitionCodeSandboxFiles(result.files);
  const failureLine = result.stderr
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return (
    <div className="flex flex-col gap-2">
      {!result.ok ? (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/5 px-3 py-2 text-[11px] text-destructive shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--destructive)_25%,transparent)]">
          <AlertTriangleIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-medium">{t("sandboxExecutionFailed")}</p>
            {failureLine ? (
              <p className="mt-0.5 truncate text-destructive/80">
                {failureLine}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("generatedFiles", { count: outputFiles.length })}
      </p>
      {outputFiles.map((file) => (
        <SandboxOutputFileCard key={file.path} file={file} />
      ))}
    </div>
  );
}