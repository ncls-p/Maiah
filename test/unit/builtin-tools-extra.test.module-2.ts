import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { builtInTools } from "@/modules/tool/builtin-tools";
import { context, mocks, runTool } from "./builtin-tools-extra.test.mocks";


describe("builtInTools", () => {
	it("executes low-risk primitive and web/artifact tools", async () => {
		expect(await runTool("calculator", { expression: "2 + 3 * 4" })).toEqual({
			result: 14,
		});
		expect(await runTool("current_time", { timezone: "UTC" })).toMatchObject({
			timezone: "UTC",
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(
			async () =>
				new Response("body", {
					status: 201,
					statusText: "Created",
					headers: { "content-type": "text/plain" },
				}),
		) as typeof fetch;
		await expect(
			runTool("http_fetch", { url: "https://example.test", method: "GET" }),
		).resolves.toMatchObject({ status: 201, bodyPreview: "body" });
		await expect(
			runTool("http_fetch", { url: "https://example.test", method: "HEAD" }),
		).resolves.toMatchObject({ bodyPreview: "" });
		globalThis.fetch = originalFetch;

		await expect(
			runTool("web_search", { query: "news" }),
		).resolves.toMatchObject({ query: "news", results: [] });
		expect(
			runTool("render_html_artifact", {
				title: "Demo",
				html: "<h1/>",
				css: "",
				js: "",
				height: 300,
			}),
		).toMatchObject({ kind: "html_artifact", title: "Demo" });
		await expect(
			runTool("run_code_sandbox", { language: "node", code: "1" }, context),
		).resolves.toMatchObject({ kind: "code_sandbox_result" });
	});

	it("delegates code workspace tools and enforces workspace context", async () => {
		await expect(
			runTool(
				"code_workspace_create_project",
				{ title: "App", rootFile: "index.html", files: [] },
				context,
			),
		).resolves.toEqual({ ok: "created" });
		await expect(
			runTool("code_workspace_list_files", { projectId: "p1" }, context),
		).resolves.toEqual({ files: [] });
		await expect(
			runTool(
				"code_workspace_read_file",
				{ projectId: "p1", path: "index.html" },
				context,
			),
		).resolves.toMatchObject({ content: "one two one" });
		await expect(
			runTool(
				"code_workspace_write_file",
				{ projectId: "p1", path: "index.html", content: "next" },
				context,
			),
		).resolves.toEqual({ ok: "written" });
		await expect(
			runTool(
				"code_workspace_write_file",
				{
					projectId: "p1",
					path: "assets/logo.png",
					attachmentId: "00000000-0000-4000-8000-000000000099",
				},
				context,
			),
		).resolves.toEqual({ ok: "imported" });
		expect(mocks.importCodeWorkspaceFile).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "p1",
				filePath: "assets/logo.png",
				bytes: new Uint8Array([1, 2, 3]),
			}),
		);
		await expect(
			runTool(
				"code_workspace_delete_file",
				{ projectId: "p1", path: "old.html" },
				context,
			),
		).resolves.toEqual({ ok: "deleted" });
		await expect(
			runTool("code_workspace_list_files", { projectId: "p1" }, undefined),
		).rejects.toThrow("Code workspace tools require chat workspace context");
		expect(mocks.createCodeWorkspaceFromFiles).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "ws-1", userId: "user-1" }),
		);
	});

	it("replaces code workspace text safely and delegates GitHub publishing", async () => {
		await expect(
			runTool(
				"code_workspace_replace_text",
				{ projectId: "p1", path: "index.html", oldText: "two", newText: "2" },
				context,
			),
		).resolves.toEqual({ ok: "written" });
		expect(mocks.writeCodeWorkspaceFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: "one 2 one" }),
		);
		await expect(
			runTool(
				"code_workspace_replace_text",
				{
					projectId: "p1",
					path: "index.html",
					oldText: "one",
					newText: "1",
					replaceAll: true,
				},
				context,
			),
		).resolves.toEqual({ ok: "written" });
		expect(mocks.writeCodeWorkspaceFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: "1 two 1" }),
		);
		await expect(
			runTool(
				"code_workspace_replace_text",
				{
					projectId: "p1",
					path: "index.html",
					oldText: "missing",
					newText: "x",
				},
				context,
			),
		).rejects.toThrow("oldText was not found");
		await expect(
			runTool(
				"code_workspace_replace_text",
				{ projectId: "p1", path: "index.html", oldText: "one", newText: "x" },
				context,
			),
		).rejects.toThrow("appears multiple times");

		await expect(
			runTool("github_get_publish_status", {}, context),
		).resolves.toEqual({ connected: true });
		await expect(
			runTool(
				"github_publish_code_workspace",
				{
					projectId: "p1",
					repositoryId: "r1",
					mode: "pull_request",
					targetBranch: "main",
				},
				context,
			),
		).resolves.toEqual({ ok: true });
		expect(mocks.publishCodeWorkspaceToGitHub).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "ws-1",
				userId: "user-1",
				conversationId: "conv-1",
			}),
		);
	});
});
