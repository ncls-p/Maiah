import { type AgentProgressModelHistoryKind } from "@/modules/agent/progress-model-history";
import { appendAgentRunStep } from "@/modules/agent/run-use-cases";
import {
  projectToolPayloadForDisplay,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { type ToolSet } from "ai";
import {
  AgentExecutionError,
  SuccessfulToolResult,
  delegationFailureModelMessage,
} from "./runtime-executor.heartbeat-ms";

export function instrumentTools(
  tools: ToolSet,
  runId: string,
  allocateSequence: () => number,
  onToolSuccess?: (result: SuccessfulToolResult) => void,
) {
  const instrumented: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    const executable = definition as typeof definition & {
      execute?: (...args: unknown[]) => Promise<unknown> | unknown;
    };
    if (!executable.execute || name.startsWith("delegate_")) {
      instrumented[name] = definition;
      continue;
    }
    const execute = executable.execute.bind(executable);
    instrumented[name] = {
      ...definition,
      execute: async (...args: unknown[]) => {
        const sequence = allocateSequence();
        try {
          const output = await execute(...args);
          await appendAgentRunStep({
            runId,
            sequence,
            kind: "tool",
            status: "success",
            name,
            inputPreview: args[0],
            outputPreview: output,
            completedAt: new Date(),
          });
          onToolSuccess?.({ toolName: name, output });
          return output;
        } catch (error) {
          await appendAgentRunStep({
            runId,
            sequence,
            kind: "tool",
            status: "failed",
            name,
            inputPreview: args[0],
            errorMessage:
              error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          });
          throw error;
        }
      },
    } as (typeof instrumented)[string];
  }
  return instrumented;
}

export function truncateDelegationResult(value: string, maxChars: number) {
  if (maxChars === 0) return value;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Delegated result truncated]`;
}

export function toolResultRecoveryContext(
  toolResults: SuccessfulToolResult[],
  maxChars: number,
) {
  const effectiveMaxChars = maxChars === 0 ? Number.MAX_SAFE_INTEGER : maxChars;
  const context = toolResults
    .map((toolResult, index) => {
      const projected = projectToolPayloadForDisplay(toolResult.output, {
        maxArrayItems: 200,
        maxDepth: 8,
        maxObjectKeys: 200,
        maxStringLength: effectiveMaxChars,
      });
      return [
        `Result ${index + 1} (${toolResult.toolName}):`,
        typeof projected === "string" ? projected : JSON.stringify(projected),
      ].join("\n");
    })
    .join("\n\n");
  if (maxChars === 0 || context.length <= maxChars) return context;
  return `${context.slice(0, maxChars)}\n\n[Tool result context truncated]`;
}

function projectedToolOutputText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(projectedToolOutputText).filter(Boolean).join("\n\n");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["result", "answer", "text", "content", "output"]) {
    if (!(key in record)) continue;
    const nested = projectedToolOutputText(record[key]);
    if (nested) return nested;
  }
  return JSON.stringify(record);
}

export function deterministicToolResultFallback(
  toolResults: SuccessfulToolResult[],
  maxChars: number,
) {
  const effectiveMaxChars = maxChars === 0 ? Number.MAX_SAFE_INTEGER : maxChars;
  const text = toolResults
    .map((toolResult) =>
      projectedToolOutputText(
        projectToolPayloadForDisplay(toolResult.output, {
          maxArrayItems: 200,
          maxDepth: 8,
          maxObjectKeys: 200,
          maxStringLength: effectiveMaxChars,
        }),
      ),
    )
    .filter(Boolean)
    .join("\n\n");
  return truncateDelegationResult(text, maxChars).trim();
}

export function isTimeoutFailure(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      if (
        current.name === "TimeoutError" ||
        /(?:aborted|failed|exceeded|timed? out).*timeout|timeout.*(?:aborted|failed|exceeded)/i.test(
          current.message,
        )
      ) {
        return true;
      }
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

export function safeAgentExecutionDetail(error: unknown, fallback: string) {
  if (error instanceof AgentExecutionError && error.safeDetail) {
    return error.safeDetail;
  }
  return safeToolErrorMessage(error, fallback);
}

export function modelSafeDelegationError(error: unknown, childRunId?: string) {
  return new AgentExecutionError(
    delegationFailureModelMessage,
    error instanceof AgentExecutionError
      ? error.code
      : "AGENT_DELEGATION_FAILED",
    error instanceof AgentExecutionError
      ? (error.runId ?? childRunId)
      : childRunId,
    safeAgentExecutionDetail(error, "Delegated task failed"),
  );
}

export function progressModelHistoryMetadata(input: {
  depth: number;
  isDelegation: boolean;
  phase: "start" | "success" | "error";
}): {
  modelHistoryKind?: AgentProgressModelHistoryKind;
} {
  if (input.depth > 0) return { modelHistoryKind: "visual-only" };
  if (!input.isDelegation) return {};
  return {
    modelHistoryKind:
      input.phase === "success" ? "delegation-result" : "visual-only",
  };
}
