import { HANDOFF_TOOL } from "@/modules/genesys/contracts";
import { BUILTIN_TOOL_SUMMARIESPart1 } from "./builtin-tools-catalog.builtin-tool-summaries.part-1";
import { BUILTIN_TOOL_SUMMARIESPart2 } from "./builtin-tools-catalog.builtin-tool-summaries.part-2";
import type { BuiltInToolSummary } from "./builtin-tools-catalog.tool-risk-level";
import { WORKFLOW_TOOL_SUMMARIES } from "@/modules/workflows/assistant-tool-contracts";

export const BUILTIN_TOOL_SUMMARIES: BuiltInToolSummary[] = [
  ...BUILTIN_TOOL_SUMMARIESPart1,
  ...BUILTIN_TOOL_SUMMARIESPart2,
  ...WORKFLOW_TOOL_SUMMARIES,
  HANDOFF_TOOL,
];
