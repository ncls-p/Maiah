import { BUILTIN_TOOL_SUMMARIESPart1 } from "./builtin-tools-catalog.builtin-tool-summaries.part-1";
import { BUILTIN_TOOL_SUMMARIESPart2 } from "./builtin-tools-catalog.builtin-tool-summaries.part-2";
import type { BuiltInToolSummary } from "./builtin-tools-catalog.tool-risk-level";

export const BUILTIN_TOOL_SUMMARIES: BuiltInToolSummary[] = [
  ...BUILTIN_TOOL_SUMMARIESPart1,
  ...BUILTIN_TOOL_SUMMARIESPart2,
];
