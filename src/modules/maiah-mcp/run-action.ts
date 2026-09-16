import { z } from "zod";
import { availableActions, type McpIdentity } from "./catalog";
import { executeAction } from "./actions";
import { MCP_BODY_CONTRACTS } from "./generated-contracts";
import { object, bodyProperties as contractProperties } from "./input-contract";
import { organizationIdForWorkspace } from "@/modules/organization/workspace-organization";

export const runInput = z.object({
  operationId: z.string().min(1).max(200),
  input: z.record(z.string(), z.unknown()).default({}),
});
const scalar = (value: unknown, name: string) => {
  if (!["string", "number", "boolean"].includes(typeof value))
    throw new Error(`${name} must be a string, number or boolean`);
  return String(value);
};
export async function runAction(
  identity: McpIdentity,
  request: z.infer<typeof runInput>,
  signal?: AbortSignal,
) {
  const action = availableActions(identity).find(
    (row) => row.operationId === request.operationId,
  );
  if (!action)
    throw new Error("Unknown or unavailable action; search the catalog first");
  const values = { ...request.input };
  const bodyProperties = contractProperties(
    MCP_BODY_CONTRACTS[action.operationId],
  );
  const fields = new Set([
    ...action.pathParameters,
    ...action.queryParameters,
    ...Object.keys(bodyProperties),
  ]);
  if (action.bodyKind === "multipart") fields.add("workspaceId");
  const workspaceId =
    typeof values.workspaceId === "string"
      ? values.workspaceId
      : identity.workspaceId;
  if (fields.has("workspaceId") && values.workspaceId === undefined)
    values.workspaceId = workspaceId;
  if (fields.has("organizationId") && values.organizationId === undefined) {
    const organizationId = await organizationIdForWorkspace(workspaceId);
    if (!organizationId) throw new Error("No organization for this project");
    values.organizationId = organizationId;
  }
  const parameters: Record<string, string> = {};
  const query: Record<string, string> = {};
  const body = { ...values };
  for (const name of action.pathParameters) {
    if (values[name] !== undefined)
      parameters[name] = scalar(values[name], name);
    delete body[name];
  }
  for (const name of action.queryParameters) {
    if (values[name] !== undefined) query[name] = scalar(values[name], name);
    if (!(name in bodyProperties) && action.bodyKind !== "multipart")
      delete body[name];
  }
  if (action.bodyKind === "none") {
    for (const [name, value] of Object.entries(body))
      query[name] = scalar(value, name);
  }
  if (
    /^(postWorkspaceAgents|patchWorkspaceAgentsAgentId)$/.test(
      action.operationId,
    )
  ) {
    for (const name of ["temperature", "topP"])
      if (typeof body[name] === "number") body[name] = String(body[name]);
  }
  const result = await executeAction(
    identity,
    {
      operationId: action.operationId,
      parameters,
      query,
      ...(action.bodyKind === "none" ? {} : { body }),
    },
    signal,
  );
  const data = object(result.result);
  const agent = object(data.agent);
  const workflow = object(data.workflow);
  const resourceId = agent.id ?? workflow.id;
  const navigation =
    result.ok &&
    typeof resourceId === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(resourceId)
      ? {
          page: agent.id ? `/agents/${resourceId}` : `/workflows/${resourceId}`,
          instruction:
            "Prefix with the current locale and open this exact page to display the result.",
        }
      : undefined;
  return {
    ...result,
    ...(navigation ? { navigation } : {}),
    ...(!result.ok
      ? {
          recovery:
            result.status === 409
              ? "Conflict: inspect the current resource and reconcile; do not blindly retry."
              : "Read the returned error. Do not repeat an ambiguous mutation or bypass a permission refusal through the UI.",
        }
      : {}),
  };
}
