import { jsonSchema, type Tool } from "ai";
import { z } from "zod";
import type { ExecutionConnection } from "@/modules/tool-connections/connection-selection";

export function routeConnectionTool(
  connections: ExecutionConnection[] | null,
  schema: Record<string, unknown>,
  tool: {
    description: string;
    inputSchema: unknown;
    execute: (connection?: {
      connectionId: string;
      connectionLabel: string;
      expectedInstanceUrl?: string;
    }) => (input: unknown) => Promise<unknown>;
  },
): Tool {
  if (connections === null)
    return {
      description: tool.description,
      inputSchema: jsonSchema(schema),
      execute: tool.execute(),
    };
  const envelope = z
    .object({ connectionId: z.string(), arguments: z.unknown() })
    .strict();
  return {
    description: `${tool.description}\nChoose the target ServiceNow connection explicitly. Available connections (name and instance URL): ${JSON.stringify(connections)}. Put the original tool input in arguments.`,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        connectionId: {
          type: "string",
          enum: connections.map((connection) => connection.id),
        },
        arguments: schema,
      },
      required: ["connectionId", "arguments"],
      additionalProperties: false,
    }),
    execute: async (value) => {
      const input = envelope.parse(value);
      const connection = connections.find(
        (item) => item.id === input.connectionId,
      );
      if (!connection)
        throw new Error(
          "Selected connection is not authorized for this assistant and conversation",
        );
      return tool.execute({
        connectionId: connection.id,
        connectionLabel: connection.label,
        expectedInstanceUrl: connection.instanceUrl ?? undefined,
      })(input.arguments);
    },
  };
}
