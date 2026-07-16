import { describe, expect, it } from "vitest";

import { OPENAPI_ROUTE_MANIFEST } from "@/modules/openapi/generated-route-manifest";
import { buildOpenApiDocument } from "@/modules/openapi/openapi";

type Operation = {
  responses: Record<string, unknown>;
  security: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  "x-maiah-api-token-supported": boolean;
  "x-maiah-permissions": string[];
};

describe("OpenAPI document", () => {
  it("documents every generated route operation exactly once", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, Record<string, Operation>>;
    let documentedOperations = 0;

    for (const route of OPENAPI_ROUTE_MANIFEST) {
      const operation = paths[route.path]?.[route.method.toLowerCase()];
      expect(operation, `${route.method} ${route.path}`).toBeDefined();
      expect(
        operation.responses["200"] ?? operation.responses["201"],
      ).toBeDefined();
      documentedOperations += 1;
    }

    expect(documentedOperations).toBe(OPENAPI_ROUTE_MANIFEST.length);
  });

  it("marks bearer-compatible operations and their permission contract", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, Record<string, Operation>>;
    const operation = paths["/api/workspace/agents"].post;

    expect(operation["x-maiah-api-token-supported"]).toBe(true);
    expect(operation["x-maiah-permissions"]).toContain("agents.create");
    expect(operation.security).toContainEqual({ workspaceBearer: [] });
  });

  it("publishes the precise API-token creation schema", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, Record<string, Operation>>;
    const operation = paths["/api/workspace/api-keys"].post;
    const content = operation.requestBody?.content as Record<
      string,
      { schema: { $ref: string } }
    >;

    expect(content["application/json"].schema.$ref).toBe(
      "#/components/schemas/CreateApiTokenRequest",
    );
    expect(operation["x-maiah-permissions"]).toEqual(["apiKeys.manageOwn"]);
  });
});
