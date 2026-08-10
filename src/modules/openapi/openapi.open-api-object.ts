export type OpenApiObject = Record<string, unknown>;

export const operationOverrides: Record<
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

export function securityFor(auth: readonly string[]) {
  const security: OpenApiObject[] = [];
  if (auth.includes("apiKey")) security.push({ workspaceBearer: [] });
  if (auth.includes("session")) security.push({ sessionCookie: [] });
  return security;
}

export function schemaForParameter(name: string) {
  if (name === "workspaceId" || name.endsWith("Id")) {
    return { type: "string", format: "uuid" };
  }
  return { type: "string" };
}

export function commonResponses(): OpenApiObject {
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

export function openAICompatibleResponses(): OpenApiObject {
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

export function genericRequestBody(bodyKind: "none" | "json" | "multipart") {
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
