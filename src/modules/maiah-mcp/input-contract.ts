import { z } from "zod";
import { uploadSchema } from "./files";
import { MCP_BODY_CONTRACTS } from "./generated-contracts";
import type { availableActions } from "./catalog";

type Action = ReturnType<typeof availableActions>[number];
export type JsonObject = Record<string, unknown>;
export const object = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

export function bodyProperties(contract: unknown): JsonObject {
  const body = object(contract);
  return Object.assign(
    {},
    object(body.properties),
    ...(Array.isArray(body.anyOf) ? body.anyOf.map(bodyProperties) : []),
  );
}

export function inputContract(
  action: Action,
  body = object(MCP_BODY_CONTRACTS[action.operationId]),
  bodyKind: string = action.bodyKind,
): JsonObject {
  if (bodyKind === "multipart" && Object.keys(body).length)
    return {
      anyOf: [inputContract(action, body, "json"), inputContract(action, {})],
    };
  if (Array.isArray(body.anyOf))
    return {
      anyOf: body.anyOf.map((branch) =>
        inputContract(action, object(branch), bodyKind),
      ),
    };
  const properties = { ...object(body.properties) };
  if (bodyKind === "multipart") {
    Object.assign(properties, object(z.toJSONSchema(uploadSchema).properties));
    properties.workspaceId = { type: "string" };
  }
  const required = new Set((body.required as string[] | undefined) ?? []);
  if (bodyKind === "multipart") required.add("files");
  for (const name of action.queryParameters) {
    properties[name] ??= { type: "string" };
  }
  for (const name of action.pathParameters) {
    properties[name] = {
      type: "string",
      description: "Existing resource ID returned by a list or read action.",
    };
    required.add(name);
  }
  if ("workspaceId" in properties) {
    properties.workspaceId = {
      type: "string",
      description:
        "Optional: defaults to the caller's active project. Overrides require permission.",
    };
    required.delete("workspaceId");
  }
  if ("organizationId" in properties) {
    properties.organizationId = {
      type: "string",
      description:
        "Optional: defaults to the organization of the selected project. Overrides require permission.",
    };
    required.delete("organizationId");
  }
  if (
    /^(postWorkspaceAgents|patchWorkspaceAgentsAgentId)$/.test(
      action.operationId,
    )
  ) {
    for (const key of ["temperature", "topP"])
      properties[key] = {
        type: "number",
        description:
          "Optional generation setting. Omit to retain the model default.",
      };
    properties.maxOutputTokens = {
      type: "integer",
      minimum: 0,
    };
  }
  return {
    type: "object",
    properties,
    ...(required.size ? { required: [...required] } : {}),
    additionalProperties:
      bodyKind === "json" && !MCP_BODY_CONTRACTS[action.operationId],
  };
}
