import { OPENAPI_ROUTE_MANIFEST } from "@/modules/openapi/generated-route-manifest";
import { buildOpenApiDocument } from "@/modules/openapi/openapi.build-open-api-document";

export type McpIdentity = {
  userId: string;
  workspaceId: string;
  authentication: "session" | "apiKey";
  headers: Record<string, string>;
};
// Authentication, inbound webhooks, recursive model execution and the MCP bridge
// are not application actions. Everything else keeps its original route guards.
const excluded =
  /^\/api\/(?:auth(?:\/|$)|mcp(?:\/|$)|companion(?:\/|$)|v1(?:\/|$)|health(?:\/|$)|openapi(?:\/|$))/;
export function availableActions(identity: McpIdentity) {
  return OPENAPI_ROUTE_MANIFEST.filter(
    (route) =>
      !excluded.test(route.path) &&
      !/\/(?:webhook|callback)(?:\/|$)/.test(route.path) &&
      !/\/(?:chat|stream)$/.test(route.path) &&
      route.auth.some((auth) => auth === identity.authentication) &&
      route.responseKind !== "stream" &&
      route.bodyKind !== "multipart",
  );
}
export function describeAction(identity: McpIdentity, operationId: string) {
  const action = availableActions(identity).find(
    (item) => item.operationId === operationId,
  );
  if (!action)
    throw new Error("Action unavailable for this authentication method");
  const document = buildOpenApiDocument();
  const contract = document.paths[action.path]?.[action.method.toLowerCase()];
  const schemas: Record<string, unknown> = {};
  const collect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "$ref" &&
        typeof child === "string" &&
        child.startsWith("#/components/schemas/")
      ) {
        const name = child.slice("#/components/schemas/".length);
        if (!(name in schemas)) {
          const schema = (
            document.components.schemas as Record<string, unknown>
          )[name];
          schemas[name] = schema;
          collect(schema);
        }
      } else collect(child);
    }
  };
  collect(contract);
  return { ...action, contract, schemas };
}
export function actionPath(
  action: ReturnType<typeof availableActions>[number],
  parameters: Record<string, string>,
  query: Record<string, string>,
) {
  let path: string = action.path;
  for (const name of action.pathParameters) {
    const value = parameters[name];
    if (!value || !/^[a-zA-Z0-9_-]+$/.test(value))
      throw new Error(`Invalid path parameter: ${name}`);
    path = path.replace(`{${name}}`, value);
  }
  if (/[{}]/.test(path)) throw new Error("Missing path parameter");
  const search = new URLSearchParams(query).toString();
  return path + (search ? `?${search}` : "");
}
