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
  "GET /api/v1/models": {
    summary: "List enabled OpenAI-compatible models",
    description:
      "OpenAI-compatible model catalog for the workspace bound to the Bearer token. Only enabled text-generation models are returned.",
    auth: ["apiKey"],
    permissions: ["models.view"],
    responses: {
      "200": {
        description: "OpenAI Model list",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OpenAIModelList" },
          },
        },
      },
    },
  },
  "GET /api/v1/models/{model}": {
    summary: "Retrieve an enabled OpenAI-compatible model",
    auth: ["apiKey"],
    permissions: ["models.view"],
    responses: {
      "200": {
        description: "OpenAI Model object",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OpenAIModel" },
          },
        },
      },
    },
  },
  "POST /api/v1/chat/completions": {
    summary: "Create an OpenAI-compatible chat completion",
    description:
      "Drop-in Chat Completions endpoint. Supports text and image inputs, function tools, tool results, structured output, token usage and SSE streaming. n must be 1; audio and log probabilities are rejected explicitly.",
    auth: ["apiKey"],
    permissions: ["models.invoke"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/OpenAIChatCompletionRequest" },
        },
      },
    },
    responses: {
      "200": {
        description:
          "Chat completion JSON, or OpenAI data-only SSE chunks ending with data: [DONE] when stream=true.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OpenAIChatCompletion" },
          },
          "text/event-stream": {
            schema: { type: "string" },
          },
        },
      },
    },
  },
  "POST /api/v1/responses": {
    summary: "Create an OpenAI-compatible response",
    description:
      "Drop-in Responses endpoint for stateless text generation. Supports text and image inputs, function calls and outputs, structured output, usage and named SSE events. Stateful previous_response_id, background mode and hosted OpenAI tools are rejected explicitly.",
    auth: ["apiKey"],
    permissions: ["models.invoke"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/OpenAIResponsesRequest" },
        },
      },
    },
    responses: {
      "200": {
        description:
          "Response object, or OpenAI named SSE events through response.completed/response.incomplete when stream=true.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OpenAIResponse" },
          },
          "text/event-stream": { schema: { type: "string" } },
        },
      },
    },
  },
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

function openAICompatibleResponses(): OpenApiObject {
  const response = (description: string) => ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/OpenAIError" },
      },
    },
  });
  return {
    "400": response("Invalid OpenAI-compatible request"),
    "401": response("Missing or invalid workspace Bearer token"),
    "403": response("Token scope or current workspace permission denied"),
    "404": response("Model not found or not enabled"),
    "429": response("Workspace quota or upstream rate limit exceeded"),
    "500": response("Unexpected proxy error"),
    "502": response("Upstream model provider error"),
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
        OpenAIError: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["message", "type", "param", "code"],
              properties: {
                message: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "invalid_request_error",
                    "authentication_error",
                    "permission_error",
                    "rate_limit_error",
                    "server_error",
                  ],
                },
                param: { type: ["string", "null"] },
                code: { type: ["string", "null"] },
              },
            },
          },
        },
        OpenAIModel: {
          type: "object",
          required: ["id", "object", "created", "owned_by"],
          properties: {
            id: { type: "string" },
            object: { type: "string", const: "model" },
            created: { type: "integer" },
            owned_by: { type: "string" },
            display_name: { type: "string" },
            context_window: { type: ["integer", "null"] },
            max_output_tokens: { type: ["integer", "null"] },
            capabilities: { type: "object", additionalProperties: true },
            maiah_model_id: { type: "string", format: "uuid" },
            maiah_provider_id: { type: "string", format: "uuid" },
            maiah_provider_name: { type: "string" },
          },
        },
        OpenAIModelList: {
          type: "object",
          required: ["object", "data"],
          properties: {
            object: { type: "string", const: "list" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/OpenAIModel" },
            },
          },
        },
        OpenAIFunctionTool: {
          type: "object",
          required: ["type", "function"],
          properties: {
            type: { type: "string", const: "function" },
            function: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", maxLength: 64 },
                description: { type: "string" },
                parameters: { type: "object", additionalProperties: true },
                strict: { type: "boolean" },
              },
            },
          },
        },
        OpenAIResponsesFunctionTool: {
          type: "object",
          required: ["type", "name"],
          properties: {
            type: { type: "string", const: "function" },
            name: { type: "string", maxLength: 64 },
            description: { type: "string" },
            parameters: { type: "object", additionalProperties: true },
            strict: { type: "boolean" },
          },
        },
        OpenAIChatCompletionRequest: {
          type: "object",
          required: ["model", "messages"],
          additionalProperties: true,
          properties: {
            model: { type: "string" },
            messages: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["role"],
                additionalProperties: true,
                properties: {
                  role: {
                    type: "string",
                    enum: [
                      "system",
                      "developer",
                      "user",
                      "assistant",
                      "tool",
                      "function",
                    ],
                  },
                  content: {},
                  tool_call_id: { type: "string" },
                  tool_calls: { type: "array", items: { type: "object" } },
                },
              },
            },
            stream: { type: "boolean", default: false },
            stream_options: {
              type: "object",
              properties: { include_usage: { type: "boolean" } },
            },
            max_completion_tokens: { type: "integer", minimum: 1 },
            max_tokens: { type: "integer", minimum: 1, deprecated: true },
            temperature: { type: "number", minimum: 0, maximum: 2 },
            top_p: { type: "number", minimum: 0, maximum: 1 },
            presence_penalty: { type: "number", minimum: -2, maximum: 2 },
            frequency_penalty: { type: "number", minimum: -2, maximum: 2 },
            seed: { type: "integer" },
            stop: {
              oneOf: [
                { type: "string" },
                { type: "array", maxItems: 4, items: { type: "string" } },
              ],
            },
            tools: {
              type: "array",
              items: { $ref: "#/components/schemas/OpenAIFunctionTool" },
            },
            tool_choice: {},
            response_format: { type: "object", additionalProperties: true },
            n: { type: "integer", const: 1, default: 1 },
          },
        },
        OpenAIChatCompletion: {
          type: "object",
          required: ["id", "object", "created", "model", "choices", "usage"],
          additionalProperties: true,
          properties: {
            id: { type: "string" },
            object: { type: "string", const: "chat.completion" },
            created: { type: "integer" },
            model: { type: "string" },
            choices: { type: "array", items: { type: "object" } },
            usage: { type: "object", additionalProperties: true },
          },
        },
        OpenAIResponsesRequest: {
          type: "object",
          required: ["model", "input"],
          additionalProperties: true,
          properties: {
            model: { type: "string" },
            input: {
              oneOf: [
                { type: "string" },
                { type: "array", minItems: 1, items: { type: "object" } },
              ],
            },
            instructions: { type: "string" },
            stream: { type: "boolean", default: false },
            max_output_tokens: { type: "integer", minimum: 1 },
            temperature: { type: "number", minimum: 0, maximum: 2 },
            top_p: { type: "number", minimum: 0, maximum: 1 },
            tools: {
              type: "array",
              items: {
                $ref: "#/components/schemas/OpenAIResponsesFunctionTool",
              },
            },
            tool_choice: {},
            text: { type: "object", additionalProperties: true },
            metadata: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            previous_response_id: {
              type: ["string", "null"],
              description: "Rejected: the Maiah proxy is stateless.",
            },
            background: {
              type: "boolean",
              description: "Rejected when true.",
            },
          },
        },
        OpenAIResponse: {
          type: "object",
          required: [
            "id",
            "object",
            "created_at",
            "status",
            "model",
            "output",
            "usage",
          ],
          additionalProperties: true,
          properties: {
            id: { type: "string" },
            object: { type: "string", const: "response" },
            created_at: { type: "integer" },
            status: {
              type: "string",
              enum: ["completed", "incomplete", "failed", "in_progress"],
            },
            model: { type: "string" },
            output: { type: "array", items: { type: "object" } },
            usage: { type: ["object", "null"], additionalProperties: true },
            error: { type: ["object", "null"], additionalProperties: true },
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
