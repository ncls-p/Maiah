import { projectToolPayloadForDisplay } from "@/modules/tool/safe-payload";

export function summarizeToolInput(toolName: string, input: unknown) {
	const safeInput = projectToolPayloadForDisplay(input);
	if (!safeInput || typeof safeInput !== "object") {
		return `Run ${toolName}`;
	}

	const record = safeInput as Record<string, unknown>;
  if (typeof record.url === "string") {
    return `Access URL ${record.url}`;
  }
  if (typeof record.query === "string") {
    return `Search for "${record.query}"`;
  }
  if (typeof record.path === "string") {
    return `Access path ${record.path}`;
  }
  if (typeof record.command === "string") {
    return `Run command: ${record.command}`;
  }

  const keys = Object.keys(record);
  if (keys.length === 1) {
    return `${toolName}: ${keys[0]} = ${String(record[keys[0]])}`;
  }

  return `Run ${toolName} with ${keys.length} parameters`;
}
