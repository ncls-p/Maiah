import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { aiModels, aiProviders } from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { refreshProviderModels } from "@/modules/provider/use-cases.refresh-provider-models";
import { updateModel } from "@/modules/provider/use-cases.update-model";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("model metadata synchronization", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await fixture?.cleanup();
  });
  it("imports API prices and explicit zero impact, preserves manual metadata, and resumes automatic updates", async () => {
    const [provider] = await db
      .insert(aiProviders)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        kind: "openai-compatible",
        name: "Metadata catalog",
        authType: "bearer",
        baseUrl: "https://catalog.example/v1",
      })
      .returning();
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider.id,
        modelId: "model",
        displayName: "Local name",
        description: "Local guidance",
        tags: ["Team choice"],
      })
      .returning();
    const catalog = () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "model",
              pricing: {
                input_per_million: "2",
                output_per_million: "3",
                currency: "USD",
              },
              sustainability: {
                energy_kwh_per_million_tokens: 0,
                co2_grams_per_million_tokens: 4,
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    vi.stubGlobal("fetch", vi.fn().mockImplementation(catalog));
    const read = async () =>
      (await db.select().from(aiModels).where(eq(aiModels.id, model.id)))[0];
    expect(
      await refreshProviderModels(provider.id, fixture.workspaceId),
    ).toMatchObject({ status: "healthy", imported: 1 });
    expect(await read()).toMatchObject({
      inputTokenCost: "2",
      outputTokenCost: "3",
      sustainabilityConfigJson: {
        energyKwhPerMillionTokens: 0,
        currency: "USD",
      },
    });
    await updateModel(model.id, {
      inputTokenCost: "8",
      sustainabilityConfigJson: {
        manualOverride: true,
        currency: "EUR",
        energyKwhPerMillionTokens: 9,
      },
    });
    await refreshProviderModels(provider.id, fixture.workspaceId);
    expect(await read()).toMatchObject({
      inputTokenCost: "8",
      description: "Local guidance",
      tags: ["Team choice"],
      sustainabilityConfigJson: {
        energyKwhPerMillionTokens: 9,
        currency: "EUR",
      },
    });
    await updateModel(model.id, {
      sustainabilityConfigJson: { manualOverride: false, currency: "EUR" },
    });
    await refreshProviderModels(provider.id, fixture.workspaceId);
    expect(await read()).toMatchObject({
      displayName: "Local name",
      inputTokenCost: "2",
      description: "Local guidance",
      tags: ["Team choice"],
      sustainabilityConfigJson: {
        energyKwhPerMillionTokens: 0,
        currency: "USD",
        manualOverride: false,
      },
    });
  });
});
