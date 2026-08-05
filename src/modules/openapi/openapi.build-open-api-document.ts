import { OPENAPI_ROUTE_MANIFEST } from "@/modules/openapi/generated-route-manifest";
import { openApiSchemasPart1 } from "./openapi.build-open-api-document.schemas-1";
import { openApiSchemasPart2 } from "./openapi.build-open-api-document.schemas-2";
import {
OpenApiObject,
commonResponses,
genericRequestBody,
openAICompatibleResponses,
operationOverrides,
schemaForParameter,
securityFor,
} from "./openapi.open-api-object";

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, OpenApiObject>> = {};

  for (const route of OPENAPI_ROUTE_MANIFEST) {
    const key = `${route.method} ${route.path}`;
    const override = operationOverrides[key];
    const permissions = override?.permissions ?? [...route.permissions];
    const auth = override?.auth ?? route.auth;
    const parameters = [
      ...route.pathParameters.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: schemaForParameter(name),
      })),
      ...route.queryParameters.map((name) => ({
        name,
        in: "query",
        required: name === "workspaceId",
        schema: schemaForParameter(name),
      })),
    ];
    const responses = {
      ...(route.path.startsWith("/api/v1/")
        ? openAICompatibleResponses()
        : commonResponses()),
      ...(route.responseKind === "stream"
        ? {
            "200": {
              description: "Streaming or binary response",
              content: {
                "application/octet-stream": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
          }
        : {}),
      ...(override?.responses ?? {}),
    };

    paths[route.path] ??= {};
    paths[route.path][route.method.toLowerCase()] = {
      tags: [route.tag],
      operationId: route.operationId,
      summary: override?.summary ?? route.summary,
      description:
        override?.description ??
        (auth.includes("apiKey")
          ? "Workspace tokens are accepted only when the token workspace matches, the user still holds the permission, and the token scope includes it."
          : undefined),
      security: securityFor(auth),
      parameters: parameters.length > 0 ? parameters : undefined,
      requestBody: override?.requestBody ?? genericRequestBody(route.bodyKind),
      responses,
      "x-maiah-permissions": permissions,
      "x-maiah-api-token-supported": auth.includes("apiKey"),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Maiah API",
      version: "1.0.0",
      description:
        "Complete contract for the routes used by the Maiah interface and the OpenAI-compatible model proxy under /api/v1. Browser sessions and scoped workspace API tokens use the same permission checks. For a token, effective access is the intersection of its scopes and the owner's current workspace permissions.",
    },
    servers: [{ url: "/", description: "Current Maiah deployment" }],
    tags: [...new Set(OPENAPI_ROUTE_MANIFEST.map(({ tag }) => tag))].map(
      (name) => ({ name }),
    ),
    paths,
    components: {
      securitySchemes: {
        workspaceBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ahub_ workspace API token",
          description:
            "A workspace-bound token created from Workspace → API keys. Its scopes never override the owner's current permissions.",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description:
            "The existing HttpOnly browser session. Swagger sends it automatically on the same origin.",
        },
      },
      schemas: { ...openApiSchemasPart1, ...openApiSchemasPart2 },
      responses: Object.fromEntries(
        [
          ["BadRequest", "Invalid input"],
          ["Unauthorized", "Missing or invalid authentication"],
          ["Forbidden", "Permission, workspace, or token scope denied"],
          ["NotFound", "Resource not found or not visible"],
          ["Conflict", "Resource state conflict"],
          ["InternalError", "Unexpected server error"],
        ].map(([name, description]) => [
          name,
          {
            description,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        ]),
      ),
    },
  };
}
