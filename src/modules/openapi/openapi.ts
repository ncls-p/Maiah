import { OPENAPI_ROUTE_MANIFEST } from "@/modules/openapi/generated-route-manifest";
import {
  API_KEY_SCOPE_CATALOG,
  API_KEY_SCOPE_PERMISSIONS,
} from "@/modules/api-keys/scopes";

type OpenApiObject = Record<string, unknown>;

const operationOverrides: Record<
  string,
  {
    summary?: string;
    description?: string;
    permissions?: string[];
    auth?: readonly ("session" | "apiKey")[];
    requestBody?: OpenApiObject;
    responses?: OpenApiObject;
  }
> = {
  "GET /api/admin/settings": {
    summary: "Read public registration settings",
    auth: [],
  },
  "GET /api/workspace/api-keys": {
    summary: "List API tokens and grantable scopes",
    description:
      "Returns active tokens visible to the caller and the precise scopes the caller may grant. API-token callers only see scopes already held by that token.",
    permissions: ["apiKeys.manageOwn"],
  },
  "POST /api/workspace/api-keys": {
    summary: "Create a scoped workspace API token",
    description:
      "The requested scopes must be known, must belong to the user's current effective permissions, and—when called by another token—must be included in the caller token's scopes.",
    permissions: ["apiKeys.manageOwn"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateApiTokenRequest" },
        },
      },
    },
    responses: {
      "201": {
        description:
          "Token created. The rawKey value is returned once and is never stored in plaintext.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateApiTokenResponse" },
          },
        },
      },
    },
  },
  "DELETE /api/workspace/api-keys/{keyId}": {
    summary: "Revoke an API token",
    permissions: ["apiKeys.manageOwn"],
  },
  "POST /api/workspace/tool-invocations/{invocationId}/approve": {
    summary: "Approve and execute a pending tool invocation",
    permissions: ["agents.chat", "tools.executeRestricted"],
  },
  "POST /api/workspace/tool-invocations/{invocationId}/reject": {
    summary: "Reject a pending tool invocation",
    permissions: ["agents.chat", "tools.executeRestricted"],
  },
  "POST /api/onboarding": { auth: ["session"] },
  "GET /api/onboarding": { auth: ["session"] },
  "POST /api/marketplace/items/{itemId}/feature": { auth: ["session"] },
  "DELETE /api/marketplace/items/{itemId}/feature": { auth: ["session"] },
  "PUT /api/marketplace/items/{itemId}/moderate": { auth: ["session"] },
  "GET /api/marketplace/items": { auth: [] },
  "GET /api/marketplace/items/{itemId}": { auth: [] },
  "PUT /api/marketplace/items/{itemId}": {
    permissions: ["marketplaceItems.publish"],
  },
  "DELETE /api/marketplace/items/{itemId}": {
    permissions: ["marketplaceItems.publish"],
  },
  "POST /api/marketplace/items/{itemId}/publish": {
    permissions: ["marketplaceItems.publish"],
  },
  "POST /api/marketplace/items/{itemId}/share": {
    permissions: ["marketplaceItems.publish"],
  },
  "DELETE /api/marketplace/items/{itemId}/share": {
    permissions: ["marketplaceItems.publish"],
  },
};

function securityFor(auth: readonly string[]) {
  const security: OpenApiObject[] = [];
  if (auth.includes("apiKey")) security.push({ workspaceBearer: [] });
  if (auth.includes("session")) security.push({ sessionCookie: [] });
  return security;
}

function schemaForParameter(name: string) {
  if (name === "workspaceId" || name.endsWith("Id")) {
    return { type: "string", format: "uuid" };
  }
  return { type: "string" };
}

function commonResponses(): OpenApiObject {
  return {
    "200": {
      description: "Successful response",
      content: {
        "application/json": {
          schema: { type: ["object", "array", "string", "null"] },
        },
      },
    },
    "400": { $ref: "#/components/responses/BadRequest" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
    "404": { $ref: "#/components/responses/NotFound" },
    "409": { $ref: "#/components/responses/Conflict" },
    "500": { $ref: "#/components/responses/InternalError" },
  };
}

function genericRequestBody(bodyKind: "none" | "json" | "multipart") {
  if (bodyKind === "none") return undefined;
  const mediaType =
    bodyKind === "multipart" ? "multipart/form-data" : "application/json";
  return {
    required: true,
    content: {
      [mediaType]: {
        schema: { type: "object", additionalProperties: true },
      },
    },
  };
}

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
      ...commonResponses(),
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
        "Complete contract for the routes used by the Maiah interface. Browser sessions and scoped workspace API tokens use the same permission checks. For a token, effective access is the intersection of its scopes and the owner's current workspace permissions.",
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
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            reason: { type: "string" },
            details: { type: "array", items: { type: "object" } },
          },
        },
        ApiTokenScope: {
          type: "string",
          enum: API_KEY_SCOPE_PERMISSIONS,
          description: API_KEY_SCOPE_CATALOG.map(
            ({ permission, risk }) => `${permission} (${risk})`,
          ).join(", "),
        },
        ApiToken: {
          type: "object",
          required: [
            "id",
            "workspaceId",
            "name",
            "keyPrefix",
            "scopes",
            "createdById",
            "createdAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            workspaceId: { type: "string", format: "uuid" },
            name: { type: "string" },
            keyPrefix: { type: "string" },
            scopes: {
              type: "array",
              items: { $ref: "#/components/schemas/ApiTokenScope" },
            },
            createdById: { type: "string", format: "uuid" },
            lastUsedAt: { type: ["string", "null"], format: "date-time" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CreateApiTokenRequest: {
          type: "object",
          additionalProperties: false,
          required: ["workspaceId", "name", "scopes"],
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            name: { type: "string", minLength: 1, maxLength: 255 },
            scopes: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { $ref: "#/components/schemas/ApiTokenScope" },
            },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
        CreateApiTokenResponse: {
          type: "object",
          required: ["apiKey", "rawKey"],
          properties: {
            apiKey: { $ref: "#/components/schemas/ApiToken" },
            rawKey: {
              type: "string",
              description: "Displayed once. Store it securely.",
            },
          },
        },
      },
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
