import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serverErrorResponse } from "@/lib/server-error-response";
import { z } from "zod";
import { availableActions, describeAction, type McpIdentity } from "./catalog";
import { actionInput, executeAction } from "./actions";

export const searchInput = z.object({
  query: z.string().max(200).default(""),
  offset: z.number().int().min(0).default(0),
});
export const describeInput = z.object({ operationId: z.string().max(200) });
export function createMaiahMcpServer(identity: McpIdentity) {
  const server = new McpServer({ name: "maiah", version: "1.0.0" });
  const output = (value: unknown, isError = false) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    isError,
  });
  server.registerTool(
    "maiah_search_actions",
    {
      description:
        "Find Maiah API actions by name, path or topic. Describes capabilities, not an authorization grant. Use describe before execute. All actions run as the current user and respect API token scopes.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true },
    },
    async ({ query, offset }) => {
      const rows = availableActions(identity).filter((action) =>
        JSON.stringify(action).toLowerCase().includes(query.toLowerCase()),
      );
      return output({
        workspaceId: identity.workspaceId,
        actions: rows.slice(offset, offset + 30),
        total: rows.length,
      });
    },
  );
  server.registerTool(
    "maiah_describe_action",
    {
      description:
        "Read the API contract and input schemas of an action before invoking it.",
      inputSchema: describeInput,
      annotations: { readOnlyHint: true },
    },
    async ({ operationId }) => {
      try {
        return output(describeAction(identity, operationId));
      } catch (error) {
        return output(
          {
            error:
              error instanceof Error ? error.message : "Action unavailable",
          },
          true,
        );
      }
    },
  );
  server.registerTool(
    "maiah_execute_action",
    {
      description:
        "Execute an authorized Maiah action. Supply its operationId and path parameters, query and JSON body from the contract. Never guess IDs. Changes are immediate. After modifying the current page, refresh it through the UI tool so the user sees the result.",
      inputSchema: actionInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      try {
        const result = await executeAction(identity, input, extra.signal);
        return output(result, !result.ok);
      } catch (error) {
        return output(serverErrorResponse(error, crypto.randomUUID()), true);
      }
    },
  );
  return server;
}
