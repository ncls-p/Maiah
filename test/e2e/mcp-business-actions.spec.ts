import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ensureE2EAssistant, login } from "./fixtures";

test("MCP creates a private configured assistant in one call and preserves version conflicts", async ({
  page,
}) => {
  const { workspaceId, agentId } = await ensureE2EAssistant();
  await login(page);
  const existing = await (
    await page.request.get(
      `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
    )
  ).json();
  const active = existing.find(
    (version: { isActive: boolean }) => version.isActive,
  );
  const tokenResponse = await page.request.post("/api/workspace/api-keys", {
    data: {
      workspaceId,
      name: "MCP business actions test",
      scopes: [
        "agents.create",
        "agents.get",
        "agents.update",
        "agents.list",
        "agents.chat",
        "workflows.view",
        "knowledgeBases.viewAllowed",
        "tools.view",
        "mcpServers.get",
        "conversations.viewOwn",
        "providers.viewMetadata",
        "models.view",
      ],
    },
  });
  expect(tokenResponse.status()).toBe(201);
  const token = await tokenResponse.json();
  const client = new Client({ name: "business-actions-test", version: "1.0" });
  const url = new URL(
    "/api/mcp",
    process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  );
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token.rawKey}` } },
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  let createdId: string | undefined;
  try {
    await client.connect(transport);
    for (const operationId of [
      "getWorkspaceConversationFolders",
      "getWorkspaceKnowledgeBases",
      "getWorkspaceTools",
      "getWorkspaceMcpServers",
      "getWorkspaceSkills",
      "getWorkspaceWorkflows",
      "getWorkspaceScheduledTasks",
      "getWorkspaceProviders",
    ]) {
      const result = await call("maiah_run_action", { operationId, input: {} });
      expect(result, operationId + ": " + JSON.stringify(result)).toMatchObject(
        { ok: true, status: 200 },
      );
    }

    const discovery = await call("maiah_search_actions", {
      query: "créer assistant privé",
    });
    expect(discovery.actions[0].operationId).toBe("postWorkspaceAgents");
    const created = await call("maiah_run_action", {
      operationId: discovery.actions[0].operationId,
      input: {
        name: `MCP LinkedIn ${Date.now()}`,
        sharingMode: "personal",
        systemPrompt: "Write useful LinkedIn posts without inventing facts.",
        providerId: active.providerId,
        modelId: active.modelId,
        temperature: 0,
        topP: 0.8,
        generationSettings: {
          topK: 30,
          seed: 0,
          maxRetries: 0,
          providerOptions: { openai: { textVerbosity: "low" } },
        },
        toolBindings: [],
      },
    });
    expect(created, JSON.stringify(created)).toMatchObject({
      ok: true,
      status: 201,
    });
    createdId = created.result.agent.id;
    const read = await call("maiah_run_action", {
      operationId: "getWorkspaceAgentsAgentId",
      input: { agentId: createdId },
    });
    expect(read).toMatchObject({ ok: true, status: 200 });
    expect(read.result.id).toBe(createdId);
    const legacyRead = await call("maiah_execute_action", {
      operationId: "getWorkspaceAgentsAgentId",
      parameters: { agentId: createdId },
    });
    expect(legacyRead).toMatchObject({ ok: true, status: 200 });
    const versions = await (
      await page.request.get(
        `/api/workspace/agents/${createdId}/versions?workspaceId=${workspaceId}`,
      )
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      temperature: "0",
      topP: "0.8",
      generationSettingsJson: {
        topK: 30,
        seed: 0,
        providerOptions: { openai: { textVerbosity: "low" } },
      },
    });
    const wrongVersion = await call("maiah_run_action", {
      operationId: "patchWorkspaceAgentsAgentId",
      input: {
        agentId: createdId,
        baseVersionId: "00000000-0000-4000-8000-000000000099",
        name: "Must not change",
      },
    });
    expect(wrongVersion).toMatchObject({ ok: false, status: 409 });
    expect(
      await (
        await page.request.get(
          `/api/workspace/agents/${createdId}/versions?workspaceId=${workspaceId}`,
        )
      ).json(),
    ).toHaveLength(1);
    await page.goto(`/en/agents/${createdId}`);
    await expect(
      page.getByText("MCP LinkedIn", { exact: false }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Advanced Technical ID/ }).click();
    await expect(page.getByLabel("temperature", { exact: true })).toHaveValue(
      "0",
    );
    await expect(page.getByLabel("top_p", { exact: true })).toHaveValue("0.8");
    await page.getByLabel("top_k", { exact: true }).fill("45");
    await page.getByLabel("temperature", { exact: true }).fill("0.7533");
    await page.getByLabel("presence_penalty", { exact: true }).fill("4.25");
    await page.getByLabel("max_output_tokens", { exact: true }).fill("50000");
    await page.locator("#agent-max-input-characters").fill("999999");
    await page.locator("#agent-summary-max-tokens").fill("17");
    await page.locator("#agent-memory-summary-threshold").fill("31");

    await page
      .getByLabel("provider_options", { exact: true })
      .fill('{"openai":{"textVerbosity":"high","parallelToolCalls":false}}');
    expect(
      await page
        .locator("input:invalid, textarea:invalid, select:invalid")
        .evaluateAll((elements) =>
          elements.map((element) => ({
            id: element.id,
            message: (element as HTMLInputElement).validationMessage,
            value: (element as HTMLInputElement).value,
          })),
        ),
    ).toEqual([]);
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/workspace/agents/${createdId}`),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: /^Advanced Technical ID/ }).click();
    await expect(page.getByLabel("top_k", { exact: true })).toHaveValue("45");
    await expect(page.getByLabel("temperature", { exact: true })).toHaveValue(
      "0.7533",
    );
    await expect(
      page.getByLabel("presence_penalty", { exact: true }),
    ).toHaveValue("4.25");
    await expect(
      page.getByLabel("max_output_tokens", { exact: true }),
    ).toHaveValue("50000");
    await expect(page.locator("#agent-max-input-characters")).toHaveValue(
      "999999",
    );
    await expect(page.locator("#agent-summary-max-tokens")).toHaveValue("17");
    expect(
      JSON.parse(
        await page.getByLabel("provider_options", { exact: true }).inputValue(),
      ),
    ).toEqual({ openai: { textVerbosity: "high", parallelToolCalls: false } });
  } finally {
    await client.close();
    if (createdId)
      await page.request.delete(
        `/api/workspace/agents/${createdId}?workspaceId=${workspaceId}`,
      );
    await page.request.delete(
      `/api/workspace/api-keys/${token.apiKey.id}?workspaceId=${workspaceId}`,
    );
  }
});
