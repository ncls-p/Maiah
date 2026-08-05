
import { BUILTIN_TOOL_SUMMARIES } from "./builtin-tools-catalog.builtin-tool-summaries";
import { BuiltInToolSummary } from "./builtin-tools-catalog.tool-risk-level";


export function listBuiltInToolSummaries(): BuiltInToolSummary[] {
  return BUILTIN_TOOL_SUMMARIES;
}
