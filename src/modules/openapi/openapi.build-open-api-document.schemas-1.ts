import {
  API_KEY_SCOPE_CATALOG,
  API_KEY_SCOPE_PERMISSIONS,
} from "@/modules/api-keys/scopes";
export const openApiSchemasPart1 = {
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
};
