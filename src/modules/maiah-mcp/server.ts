import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { serverErrorResponse } from "@/lib/server-error-response";
import { z } from "zod";
import { describeAction, type McpIdentity } from "./catalog";
import { actionInput, executeAction } from "./actions";
import { runAction, runInput } from "./run-action";
import { searchActions } from "./search";

export const searchInput = z.object({
  query: z.string().max(200).default(""),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(10).default(5),
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
        "Find Maiah actions by resource and intent in French or English (e.g. créer assistant, workflows, scheduled tasks). Returns ready-to-use input schemas: call maiah_run_action directly without another describe call. Names and IDs come from list/read actions. All actions run as the current user and respect API token scopes.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true },
    },
    async ({ query, offset, limit }) =>
      output(searchActions(identity, query, offset, limit)),
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
  server.registerTool(
    "maiah_run_action",
    {
      description:
        "Preferred way to perform any Maiah action. Use the inputSchema returned by search. Pass business fields directly in input; project and organization context are automatic. Create fully configured resources in a single call where supported. Permissions are checked by the existing application routes. Do not retry ambiguous writes.",
      inputSchema: runInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      try {
        const result = await runAction(identity, input, extra.signal);
        return output(result, !result.ok);
      } catch (error) {
        return output(serverErrorResponse(error, crypto.randomUUID()), true);
      }
    },
  );
  return server;
}
