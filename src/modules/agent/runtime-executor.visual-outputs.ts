import type { SuccessfulToolResult } from "./runtime-executor.heartbeat-ms";

export type AgentVisualOutput = {
  id: string;
  toolName: string;
  kind: string;
  title: string;
  output: unknown;
};

export type AgentVisualOutputSummary = Omit<
  AgentVisualOutput,
  "output" | "toolName"
>;

function recordFrom(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function visualOutputDescriptor(
  output: unknown,
): { kind: string; title: string } | null {
  const record = recordFrom(output);
  if (!record || typeof record.kind !== "string") return null;

  if (record.kind === "html_artifact") {
    return {
      kind: record.kind,
      title:
        typeof record.title === "string"
          ? record.title
          : "Interactive artifact",
    };
  }
  if (record.kind === "generated_image") {
    const attachment = recordFrom(record.attachment);
    return {
      kind: record.kind,
      title:
        attachment && typeof attachment.fileName === "string"
          ? attachment.fileName
          : "Generated image",
    };
  }
  if (record.kind === "code_workspace_artifact") {
    return {
      kind: record.kind,
      title: typeof record.title === "string" ? record.title : "Code workspace",
    };
  }
  if (record.kind === "chat_image" || record.kind === "chat_file") {
    return {
      kind: record.kind,
      title:
        typeof record.fileName === "string"
          ? record.fileName
          : "Generated file",
    };
  }
  if (record.kind === "code_sandbox_result" && Array.isArray(record.files)) {
    const hasProducedFile = record.files.some((file) => {
      const fileRecord = recordFrom(file);
      return (
        fileRecord &&
        (fileRecord.fromInput !== true || fileRecord.modified === true)
      );
    });
    return hasProducedFile
      ? { kind: record.kind, title: "Sandbox output" }
      : null;
  }
  return null;
}

export function collectAgentVisualOutputs(
  results: SuccessfulToolResult[],
): AgentVisualOutput[] {
  return results.flatMap((result) => {
    const descriptor = visualOutputDescriptor(result.output);
    return descriptor
      ? [
          {
            id: crypto.randomUUID(),
            toolName: result.toolName,
            output: result.output,
            ...descriptor,
          },
        ]
      : [];
  });
}

export function summarizeAgentVisualOutput(
  output: AgentVisualOutput,
): AgentVisualOutputSummary {
  return { id: output.id, kind: output.kind, title: output.title };
}
