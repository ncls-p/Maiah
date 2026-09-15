import { describe, expect, it } from "vitest";
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";
import { Readable } from "node:stream";
describe("AWS control-plane authentication", () => {
  it("uses Bedrock bearer tokens for catalog discovery without IAM fallback", async () => {
    let authorization = "";
    const client = new BedrockClient({
      region: "eu-west-1",
      token: { token: "tenant-token" },
      authSchemePreference: ["httpBearerAuth"],
      credentials: async () => {
        throw new Error("IAM must not be used");
      },
      requestHandler: {
        handle: async (request: { headers: Record<string, string> }) => {
          authorization =
            new Headers(request.headers).get("authorization") ?? "";
          return {
            response: {
              statusCode: 200,
              headers: { "content-type": "application/json" },
              body: Readable.from([JSON.stringify({ modelSummaries: [] })]),
            },
          };
        },
      },
    });
    try {
      await client.send(new ListFoundationModelsCommand({}));
      expect(authorization).toBe("Bearer tenant-token");
    } finally {
      client.destroy();
    }
  });
});
