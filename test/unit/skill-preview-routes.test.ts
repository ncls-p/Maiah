import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	requirePermission: vi.fn(),
	preview: vi.fn(),
	createPreviewToken: vi.fn(),
	install: vi.fn(),
	canManageGlobals: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
	requireWorkspacePermissionAsync: mocks.requirePermission,
	handleRoute: async (
		request: Request,
		handler: (context: {
			session: { user: { id: string } };
			request: Request;
		}) => Promise<Response>,
		options?: { expectedError?: (error: unknown) => Response | null },
	) => {
		try {
			return await handler({
				session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
				request,
			});
		} catch (error) {
			return (
				options?.expectedError?.(error) ??
				Response.json({ error: "Internal server error" }, { status: 500 })
			);
		}
	},
}));

vi.mock("@/modules/admin/auth", () => ({
	canManageTenantGlobals: mocks.canManageGlobals,
}));

vi.mock("@/modules/skills/use-cases", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/modules/skills/use-cases")>();
	return {
		...actual,
		previewSkillInstall: mocks.preview,
		createSkillInstallPreviewToken: mocks.createPreviewToken,
		installSkillsFromCommand: mocks.install,
		listAgentSkills: vi.fn(),
		createSkillManually: vi.fn(),
	};
});

import { POST as previewSkill } from "@/app/api/workspace/skills/preview/route";
import { POST as installSkill } from "@/app/api/workspace/skills/route";
import { SkillPreviewConflictError } from "@/modules/skills/use-cases";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const installCommand = "npx skills add owner/repo --skill research";

function post(url: string, body: Record<string, unknown>) {
	return new NextRequest(`http://localhost${url}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requirePermission.mockResolvedValue(null);
	mocks.canManageGlobals.mockResolvedValue(false);
	mocks.preview.mockResolvedValue([
		{
			name: "research",
			description: null,
			sourcePackage: "owner/repo",
			markdownFiles: [{ path: "SKILL.md", content: "# Research" }],
		},
	]);
	mocks.createPreviewToken.mockReturnValue({
		previewToken: "signed-preview",
		expiresAt: "2026-07-09T22:00:00.000Z",
		contentChecksum: "a".repeat(64),
	});
});

describe("skill preview routes", () => {
	it("requires workspace configuration permission and returns an attestation", async () => {
		const response = await previewSkill(
			post("/api/workspace/skills/preview", {
				workspaceId,
				installCommand,
			}),
		);

		expect(response.status).toBe(200);
		expect(mocks.requirePermission).toHaveBeenCalledWith(
			"11111111-1111-4111-8111-111111111111",
			workspaceId,
			"tools.configure",
		);
		await expect(response.json()).resolves.toMatchObject({
			previewToken: "signed-preview",
			contentChecksum: "a".repeat(64),
			skills: [expect.objectContaining({ name: "research" })],
		});
	});

	it("maps a changed source to a machine-readable conflict", async () => {
		mocks.install.mockRejectedValueOnce(new SkillPreviewConflictError());
		const response = await installSkill(
			post("/api/workspace/skills", {
				workspaceId,
				installCommand,
				previewToken: "signed-preview",
			}),
		);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			code: "SKILL_PREVIEW_STALE",
		});
	});

	it("does not accept installation without a preview attestation", async () => {
		const response = await installSkill(
			post("/api/workspace/skills", { workspaceId, installCommand }),
		);

		expect(response.status).toBe(400);
		expect(mocks.install).not.toHaveBeenCalled();
	});
});
