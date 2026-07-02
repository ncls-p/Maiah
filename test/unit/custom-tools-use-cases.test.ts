import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
	registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi.fn().mockResolvedValue("encrypted-payload"),
	decryptValue: vi.fn().mockResolvedValue("decrypted-value"),
}));

vi.mock("@/modules/mcp/client", () => ({
	callRemoteMcpTool: vi.fn().mockResolvedValue({ id: "wf-1" }),
}));

vi.mock("@/modules/mcp/use-cases", () => ({
	getMcpServer: vi.fn().mockResolvedValue({
		id: "mcp-1",
		workspaceId: "ws-1",
		name: "n8n",
		transport: "sse",
		url: "https://example.test/sse",
		enabled: true,
	}),
}));

vi.mock("@/server/infrastructure/providers", () => ({
	getAdapter: vi.fn().mockReturnValue({
		createChatModel: vi.fn().mockReturnValue({ model: "runtime-model" }),
	}),
}));

vi.mock("ai", () => ({
	generateText: vi.fn().mockResolvedValue({ text: "Automation ready." }),
	tool: vi.fn((definition) => definition),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"set",
		"onConflictDoUpdate",
	] as const) {
		c[key] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}

type DbModule = {
	db: {
		select: ReturnType<typeof vi.fn>;
		insert: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	_c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		_c: chain,
	};
});

import { generateText } from "ai";
import { decryptValue } from "@/lib/crypto";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import * as _dbModule from "@/server/infrastructure/db";
import {
	deleteCustomTool,
	executeCustomToolWorkflow,
	getCustomToolBuilderAdminState,
	listCustomTools,
	runCustomToolBuilder,
	setCustomToolBuilderConfig,
	submitSecretRequest,
} from "@/modules/custom-tools/use-cases";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"set",
		"onConflictDoUpdate",
	] as const) {
		dbModule._c[key].mockReset().mockReturnThis();
	}
	dbModule._c.limit.mockReset().mockResolvedValue([]);
	dbModule._c.returning.mockReset().mockResolvedValue([]);
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
}

const enabledConfig = {
	enabled: true,
	providerId: "11111111-1111-4111-8111-111111111111",
	modelId: "22222222-2222-4222-8222-222222222222",
	n8nMcpServerId: "33333333-3333-4333-8333-333333333333",
	createWorkflowToolName: "n8n_create_workflow",
	validateWorkflowToolName: "n8n_validate_workflow",
	activateWorkflowToolName: "n8n_update_partial_workflow",
	credentialToolName: "n8n_manage_credentials",
	allowWorkflowActivation: false,
};

const providerRow = {
	id: enabledConfig.providerId,
	workspaceId: null,
	name: "OpenAI",
	kind: "openai",
	enabled: true,
	baseUrl: null,
	authType: "bearer",
	encryptedApiKey: "enc-api-key",
	encryptedHeadersJson: { "x-test": "enc-header" },
	queryParamsJson: { beta: "true" },
};

const modelRow = {
	id: enabledConfig.modelId,
	providerId: enabledConfig.providerId,
	modelId: "gpt-4.1-mini",
	displayName: "GPT 4.1 Mini",
	enabled: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	resetDb();
	vi.mocked(generateText).mockResolvedValue({
		text: "Automation ready.",
	} as never);
	vi.mocked(callRemoteMcpTool).mockResolvedValue({
		content: [{ type: "text", text: JSON.stringify({ id: "wf-1" }) }],
	});
	vi.mocked(decryptValue).mockResolvedValue("decrypted-value");
});

describe("custom tool builder config", () => {
	it("persists and reloads builder config", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ valueJson: { enabled: true } }]);

		const result = await setCustomToolBuilderConfig(
			{
				enabled: true,
				createWorkflowToolName: "n8n_create_workflow",
				validateWorkflowToolName: "n8n_validate_workflow",
				activateWorkflowToolName: "n8n_update_partial_workflow",
				credentialToolName: "n8n_manage_credentials",
				allowWorkflowActivation: false,
			},
			"user-1",
		);

		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(dbModule._c.onConflictDoUpdate).toHaveBeenCalled();
		expect(result).toEqual({
			enabled: true,
			createWorkflowToolName: "n8n_create_workflow",
			validateWorkflowToolName: "n8n_validate_workflow",
			activateWorkflowToolName: "n8n_update_partial_workflow",
			credentialToolName: "n8n_manage_credentials",
			allowWorkflowActivation: false,
		});
	});

	it("returns admin state with enabled providers, models, and MCP servers", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ valueJson: enabledConfig }]);
		dbModule._c.orderBy
			.mockResolvedValueOnce([{ id: "provider-1", name: "Provider" }])
			.mockResolvedValueOnce([{ id: "mcp-1", name: "n8n" }])
			.mockResolvedValueOnce([{ id: "model-1", modelId: "gpt" }]);

		const result = await getCustomToolBuilderAdminState();

		expect(result.config.enabled).toBe(true);
		expect(result.providers).toHaveLength(1);
		expect(result.models).toHaveLength(1);
		expect(result.mcpServers).toHaveLength(1);
	});
});

describe("submitSecretRequest", () => {
	it("rejects missing, completed, and expired requests", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(
			submitSecretRequest({
				workspaceId: "ws-1",
				userId: "user-1",
				requestId: "req-1",
				values: {},
			}),
		).rejects.toThrow("Secret request not found");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([
			{
				status: "submitted",
				expiresAt: new Date(Date.now() + 1000),
				fieldsJson: [],
			},
		]);
		await expect(
			submitSecretRequest({
				workspaceId: "ws-1",
				userId: "user-1",
				requestId: "req-1",
				values: {},
			}),
		).rejects.toThrow("Secret request is no longer pending");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([
			{
				status: "pending",
				expiresAt: new Date(Date.now() - 1000),
				fieldsJson: [],
			},
		]);
		await expect(
			submitSecretRequest({
				workspaceId: "ws-1",
				userId: "user-1",
				requestId: "req-1",
				values: {},
			}),
		).rejects.toThrow("Secret request expired");
	});

	it("validates required fields and stores encrypted sanitized values", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "req-1",
				title: "Discord",
				status: "pending",
				expiresAt: new Date(Date.now() + 1000),
				fieldsJson: [
					{
						name: "webhook_url",
						label: "Webhook URL",
						type: "url",
						required: true,
					},
				],
			},
		]);
		dbModule._c.returning.mockResolvedValueOnce([{ id: "cred-1" }]);

		const result = await submitSecretRequest({
			workspaceId: "ws-1",
			userId: "user-1",
			requestId: "req-1",
			values: { webhook_url: " https://discord.test/hook " },
		});

		expect(result.credentialRef).toBe("cred-1");
		expect(result.fields[0]).toMatchObject({
			name: "webhook_url",
			received: true,
		});
		expect(dbModule.db.update).toHaveBeenCalled();
	});

	it("rejects missing required values", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "req-1",
				title: "Token",
				status: "pending",
				expiresAt: new Date(Date.now() + 1000),
				fieldsJson: [
					{ name: "token", label: "Token", type: "secret", required: true },
				],
			},
		]);

		await expect(
			submitSecretRequest({
				workspaceId: "ws-1",
				userId: "user-1",
				requestId: "req-1",
				values: {},
			}),
		).rejects.toThrow("Missing value for Token");
	});
});

describe("custom tool listing and deletion", () => {
	it("adds canEdit for creator, manager-managed global tools, and non-editable rows", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([
			{ id: "own", createdById: "user-1", isGlobal: false, name: "Own" },
			{ id: "global", createdById: "other", isGlobal: true, name: "Global" },
			{ id: "other", createdById: "other", isGlobal: false, name: "Other" },
		]);

		const result = await listCustomTools("ws-1", "user-1", true);

		expect(result.map((item) => item.canEdit)).toEqual([true, true, false]);
	});

	it("throws when deleting an absent or unauthorized custom tool", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([]);

		await expect(
			deleteCustomTool({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: "missing",
			}),
		).rejects.toThrow("Custom tool not found");

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([
				{ id: "tool-1", createdById: "other", isGlobal: false },
			]);
		await expect(
			deleteCustomTool({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: "tool-1",
			}),
		).rejects.toThrow("Custom tool not found");
	});

	it("archives editable tools and reports workflow deletion failures", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([
				{
					id: "tool-1",
					createdById: "user-1",
					isGlobal: false,
					n8nWorkflowId: "wf-1",
				},
			]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "n8n_delete_workflow" }]);
		vi.mocked(callRemoteMcpTool).mockRejectedValueOnce(
			new Error("remote down"),
		);

		const result = await deleteCustomTool({
			workspaceId: "ws-1",
			userId: "user-1",
			customToolId: "tool-1",
		});

		expect(result).toEqual({
			deleted: true,
			workflowDeleted: false,
			workflowDeleteError: "remote down",
		});
		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

describe("executeCustomToolWorkflow", () => {
	it("rejects absent, private, and workflow-less tools", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([]);
		await expect(
			executeCustomToolWorkflow({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: "missing",
				toolInput: {},
			}),
		).rejects.toThrow("Custom tool not found");

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([
				{ createdById: "other", isGlobal: false, n8nWorkflowId: "wf-1" },
			]);
		await expect(
			executeCustomToolWorkflow({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: "tool-1",
				toolInput: {},
			}),
		).rejects.toThrow("Custom tool not found");

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([
				{ createdById: "user-1", isGlobal: false, n8nWorkflowId: null },
			]);
		await expect(
			executeCustomToolWorkflow({
				workspaceId: "ws-1",
				userId: "user-1",
				customToolId: "tool-1",
				toolInput: {},
			}),
		).rejects.toThrow("Custom tool is not linked to a workflow yet");
	});

	it("runs the configured workflow with object input only", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([
				{ createdById: "user-1", isGlobal: false, n8nWorkflowId: "wf-1" },
			]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "n8n_test_workflow" }]);

		await executeCustomToolWorkflow({
			workspaceId: "ws-1",
			userId: "user-1",
			customToolId: "tool-1",
			toolInput: "ignored",
		});

		expect(callRemoteMcpTool).toHaveBeenCalledWith(
			expect.any(Object),
			"n8n_test_workflow",
			expect.objectContaining({
				workflowId: "wf-1",
				data: {},
				timeout: 120000,
			}),
		);
	});
});

describe("runCustomToolBuilder", () => {
	it("rejects disabled builder, wrong workspace, and missing LLM config", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{ valueJson: { enabled: false } },
		]);
		await expect(
			runCustomToolBuilder({
				workspaceId: "ws-1",
				userId: "user-1",
				messages: [],
			}),
		).rejects.toThrow("Custom tool builder is disabled");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([
			{
				valueJson: {
					...enabledConfig,
					workspaceId: "44444444-4444-4444-8444-444444444444",
				},
			},
		]);
		await expect(
			runCustomToolBuilder({
				workspaceId: "ws-1",
				userId: "user-1",
				messages: [],
			}),
		).rejects.toThrow("configured for another workspace");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([{ valueJson: { enabled: true } }]);
		await expect(
			runCustomToolBuilder({
				workspaceId: "ws-1",
				userId: "user-1",
				messages: [],
			}),
		).rejects.toThrow("LLM is not configured");
	});

	it("builds a runtime model and returns the generated response", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([providerRow])
			.mockResolvedValueOnce([modelRow]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([]);

		const result = await runCustomToolBuilder({
			workspaceId: "ws-1",
			userId: "user-1",
			messages: [{ role: "user", content: "Build a notifier" }],
			credentialRefs: [
				{
					requestId: "req-1",
					credentialRef: "33333333-3333-4333-8333-333333333333",
				},
			],
		});

		expect(result.message).toBe("Automation ready.");
		expect(result.actionCount).toBe(0);
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [{ role: "user", content: "Build a notifier" }],
				system: expect.stringContaining("custom-tool builder assistant"),
			}),
		);
		expect(decryptValue).toHaveBeenCalledWith("enc-api-key");
		expect(decryptValue).toHaveBeenCalledWith("enc-header");
	});

	it("infers a secure Discord webhook request from assistant text", async () => {
		vi.mocked(generateText).mockResolvedValueOnce({
			text: "Il me manque le webhook Discord. Clique le bouton sécurisé pour le renseigner.",
		} as never);
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([providerRow])
			.mockResolvedValueOnce([modelRow]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([]);
		dbModule._c.returning.mockResolvedValueOnce([
			{
				id: "secret-req-1",
				title: "Connexion Discord",
				description: "desc",
				expiresAt: new Date(Date.now() + 1000),
			},
		]);

		const result = await runCustomToolBuilder({
			workspaceId: "ws-1",
			userId: "user-1",
			messages: [{ role: "user", content: "Send Discord alerts" }],
		});

		expect(result.secretRequests).toHaveLength(1);
		expect(result.secretRequests[0].fields[0].name).toBe("discord_webhook_url");
		expect(result.actionCount).toBe(1);
	});

	it("executes builder tool callbacks for previews, secrets, workflows, credentials, and registration", async () => {
		const credentialRef = "55555555-5555-4555-8555-555555555555";
		vi.mocked(decryptValue)
			.mockResolvedValueOnce("api-key")
			.mockResolvedValueOnce("header-value")
			.mockResolvedValueOnce(
				JSON.stringify({ webhookUrl: "https://discord.test/webhook" }),
			)
			.mockResolvedValueOnce(JSON.stringify({ token: "secret-token" }));
		vi.mocked(callRemoteMcpTool)
			.mockResolvedValueOnce({
				content: [{ type: "text", text: JSON.stringify({ id: "wf-created" }) }],
			})
			.mockResolvedValueOnce({ content: [{ type: "text", text: "activated" }] })
			.mockResolvedValueOnce({ content: [{ type: "text", text: "valid" }] })
			.mockResolvedValueOnce({
				structuredContent: { id: "n8n-cred-1" },
				content: [],
			} as never);
		vi.mocked(generateText).mockImplementationOnce((async (
			options: unknown,
		) => {
			const opts = options as {
				tools: Record<string, { execute: (input: never) => Promise<unknown> }>;
			};
			await opts.tools.update_workflow_preview.execute({
				title: "Discord notifier",
				summary: "Send a message",
				status: "draft",
				steps: [{ label: "Receive", description: "Get input" }],
			} as never);
			await opts.tools.request_user_secrets.execute({
				title: "Discord",
				description: "Webhook",
				fields: [
					{
						name: "webhookUrl",
						label: "Webhook URL",
						type: "secret",
						required: true,
					},
				],
			} as never);
			await opts.tools.create_n8n_workflow.execute({
				name: "Discord notifier",
				nodes: [
					{
						name: "Internal trigger",
						type: "n8n-nodes-base.executeWorkflowTrigger",
						parameters: { url: `__SECRET:${credentialRef}:webhookUrl__` },
					},
				],
				connections: {},
				settings: { executionOrder: "v1" },
			} as never);
			await opts.tools.validate_n8n_workflow.execute({
				id: "wf-created",
			} as never);
			await opts.tools.create_n8n_credential_from_ref.execute({
				credentialRef,
				credentialType: "discordWebhookApi",
				name: "Discord webhook",
			} as never);
			await opts.tools.register_custom_tool.execute({
				name: "Discord notifier",
				description: "Notify Discord",
				inputSchema: { type: "object" },
			} as never);
			return { text: "Registered." } as never;
		}) as never);
		dbModule._c.limit
			.mockResolvedValueOnce([
				{ valueJson: { ...enabledConfig, allowWorkflowActivation: true } },
			])
			.mockResolvedValueOnce([providerRow])
			.mockResolvedValueOnce([modelRow])
			.mockResolvedValueOnce([
				{ id: credentialRef, encryptedPayload: "enc-payload" },
			])
			.mockResolvedValueOnce([
				{ id: credentialRef, encryptedPayload: "enc-payload" },
			]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "server__n8n_create_workflow" }])
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "server__n8n_create_workflow" }])
			.mockResolvedValueOnce([{ name: "server__n8n_update_partial_workflow" }])
			.mockResolvedValueOnce([{ name: "server__n8n_validate_workflow" }])
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "server__n8n_manage_credentials" }]);
		dbModule._c.returning
			.mockResolvedValueOnce([
				{
					id: "secret-request-1",
					title: "Discord",
					description: "Webhook",
					expiresAt: new Date(Date.now() + 1000),
				},
			])
			.mockResolvedValueOnce([
				{ id: "tool-1", name: "Discord notifier", status: "workflow_created" },
			]);

		const result = await runCustomToolBuilder({
			workspaceId: "ws-1",
			userId: "user-1",
			messages: [{ role: "user", content: "Build it" }],
			credentialRefs: [{ requestId: "req-1", credentialRef }],
			isGlobal: true,
		});

		expect(result.message).toBe("Registered.");
		expect(result.secretRequests).toHaveLength(1);
		expect(result.createdWorkflows).toHaveLength(1);
		expect(result.workflowPreviews).toHaveLength(1);
		expect(result.registeredTools).toEqual([
			{ id: "tool-1", name: "Discord notifier", status: "workflow_created" },
		]);
		expect(result.progressEvents.map((event) => event.label)).toContain(
			"Tool enregistré",
		);
		expect(callRemoteMcpTool).toHaveBeenCalledWith(
			expect.any(Object),
			"server__n8n_create_workflow",
			expect.objectContaining({ name: "Discord notifier" }),
		);
	});
});
