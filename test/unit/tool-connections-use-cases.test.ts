import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/db", () => ({
	db: {},
}));

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
	buildSignedToolContextHeaders,
	toSafeToolConnection,
	toSafeToolConnector,
	toolContextHeaderNames,
} from "@/modules/tool-connections/use-cases";

describe("tool connection DTOs", () => {
	it("omits encrypted connector/connection internals from safe DTOs", () => {
		const connector = toSafeToolConnector({
			id: "connector-1",
			workspaceId: "ws-1",
			createdById: "user-1",
			key: "servicenow",
			name: "ServiceNow",
			description: "ServiceNow connector",
			kind: "mcp",
			mcpServerId: "server-1",
			configSchemaJson: { instanceUrl: { type: "string" } },
			secretSchemaJson: { password: { type: "password" } },
			defaultConfigJson: null,
			enabled: true,
			isGlobal: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
			archivedAt: null,
		});
		const connection = toSafeToolConnection({
			id: "connection-1",
			workspaceId: "ws-1",
			connectorId: "connector-1",
			ownerType: "user",
			ownerUserId: "user-1",
			label: "Prod",
			configJson: { instanceUrl: "https://example.service-now.com" },
			encryptedSecretsJson: { password: "encrypted" },
			isDefault: true,
			status: "active",
			lastValidatedAt: null,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
			archivedAt: null,
		});

		expect(connector).toMatchObject({ key: "servicenow", kind: "mcp" });
		expect(connection).toMatchObject({ label: "Prod", hasSecrets: true });
		expect(connection).not.toHaveProperty("encryptedSecretsJson");
	});
});

describe("signed tool context headers", () => {
	it("encodes and signs the short-lived gateway context", () => {
		const headers = buildSignedToolContextHeaders({
			version: 1,
			connectorKey: "servicenow",
			secrets: { username: "alice", password: "secret" },
		});
		const names = toolContextHeaderNames();
		const encoded = headers[names.context];
		const envelope = JSON.parse(
			Buffer.from(encoded, "base64url").toString("utf8"),
		) as { alg: string; iv: string; ciphertext: string; tag: string };

		expect(envelope.alg).toBe("A256GCM");
		expect(envelope.iv).toEqual(expect.any(String));
		expect(envelope.ciphertext).toEqual(expect.any(String));
		expect(envelope.tag).toEqual(expect.any(String));
		expect(encoded).not.toContain("alice");
		expect(encoded).not.toContain("secret");
		expect(headers[names.signature]).toMatch(/^[a-f0-9]{64}$/);
	});
});
