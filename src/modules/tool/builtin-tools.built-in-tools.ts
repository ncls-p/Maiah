import { genesysHandoffTool } from "@/modules/genesys/tool";
import type { BuiltInToolDefinition } from "./builtin-tools.built-in-tool-execution-context";
import { builtInToolsPart1 } from "./builtin-tools.built-in-tools.part-1";
import { builtInToolsPart2 } from "./builtin-tools.built-in-tools.part-2";
import { builtInToolsPart3 } from "./builtin-tools.built-in-tools.part-3";
import { workflowAssistantTools } from "@/modules/workflows/assistant-tools";

export const builtInTools = [
  ...builtInToolsPart1,
  ...builtInToolsPart2,
  ...builtInToolsPart3,
  ...workflowAssistantTools,
  genesysHandoffTool,
] satisfies BuiltInToolDefinition[];
