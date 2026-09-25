"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  codeSandboxFailureSummary,
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
  const failure = result.ok ? null : codeSandboxFailureSummary(result);

  return (
    <div className="flex flex-col gap-2">
      {failure ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl bg-destructive/5 px-3 py-2 text-[11px] text-destructive shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--destructive)_25%,transparent)]"
        >
          <AlertTriangleIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-medium">
              {failure.timedOut
                ? t("sandboxExecutionTimedOut")
                : t("sandboxExecutionFailed")}
            </p>
            {failure.line ? (
              <p
                className="mt-0.5 truncate text-destructive/80"
                title={failure.line}
              >
                {failure.line}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("generatedFiles", { count: outputFiles.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {outputFiles.map((file) => (
          <li key={file.path}>
            <SandboxOutputFileCard file={file} />
          </li>
        ))}
      </ul>
    </div>
  );
}
