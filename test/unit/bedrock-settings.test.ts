import { describe, expect, it } from "vitest";
import { prepareBedrockSettings } from "@/modules/provider/bedrock-settings";
import { decryptValue } from "@/lib/crypto";
describe("encrypted Bedrock settings", () => {
  it("encrypts IAM secrets, retains omitted fields and clears an explicit session token", async () => {
    const original = await prepareBedrockSettings(
      {
        region: "eu-west-1",
        authMode: "iam",
        accessKeyId: "tenant-access",
        secretAccessKey: "tenant-secret",
        sessionToken: "temporary",
      },
      undefined,
    );
    expect(original.encryptedAwsCredentials).not.toContain("tenant-secret");
    const updated = await prepareBedrockSettings(
      { region: "eu-west-2", authMode: "iam", sessionToken: "" },
      undefined,
      original,
    );
    expect(
      JSON.parse(await decryptValue(updated.encryptedAwsCredentials!)),
    ).toEqual({
      accessKeyId: "tenant-access",
      secretAccessKey: "tenant-secret",
    });
    expect(updated.bedrockConfigJson).toEqual({
      region: "eu-west-2",
      authMode: "iam",
    });
    const switched = await prepareBedrockSettings(
      { region: "eu-west-1", authMode: "api-key" },
      "new-key",
      original,
    );
    expect(switched.encryptedAwsCredentials).toBeNull();
  });
  it("requires explicit credentials for a new connection and allows keeping an existing key", async () => {
    await expect(
      prepareBedrockSettings({ region: "eu-west-1", authMode: "api-key" }, ""),
    ).rejects.toThrow("BEDROCK_API_KEY_REQUIRED");
    await expect(
      prepareBedrockSettings(
        { region: "eu-west-1", authMode: "iam" },
        undefined,
      ),
    ).rejects.toThrow("BEDROCK_IAM_CREDENTIALS_REQUIRED");
    expect(
      await prepareBedrockSettings(
        { region: "eu-west-1", authMode: "api-key" },
        undefined,
        { encryptedApiKey: "encrypted" },
      ),
    ).toMatchObject({ encryptedAwsCredentials: null });
  });
});
