import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function projectFile(filePath: string) {
	return readFileSync(path.join(projectRoot, filePath), "utf8");
}

describe("runtime packaging guardrails", () => {
	it("keeps pdf-parse and its canvas dependency external to Next server chunks", () => {
		const nextConfig = projectFile("next.config.ts");
		const attachmentModule = projectFile("src/modules/chat/attachments.ts");

		expect(nextConfig).toContain(
			'serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"]',
		);
		expect(attachmentModule).toContain('import "pdf-parse/worker";');
	});

	it("ships the document-search command used by the sandbox instructions", () => {
		const dockerfile = projectFile("Dockerfile");
		const sandboxStage = dockerfile.slice(
			dockerfile.indexOf("FROM node:22-bookworm-slim AS sandbox-runner"),
			dockerfile.indexOf("FROM base AS deps"),
		);

		expect(sandboxStage).toMatch(/^\s*ripgrep\s*\\$/m);
	});

	it("keeps the sandbox container under strict resource ceilings", () => {
		for (const composeFile of [
			"docker-compose.dev.yml",
			"docker-compose.prod.yml",
		]) {
			const sandbox = projectFile(composeFile).slice(
				projectFile(composeFile).indexOf("  sandbox-runner:"),
			);
			expect(sandbox).toContain('cpus: "0.50"');
			expect(sandbox).toContain("mem_limit: 768m");
			expect(sandbox).toContain("memswap_limit: 768m");
			expect(sandbox).toContain("pids_limit: 64");
			expect(sandbox).toContain("SANDBOX_MAX_TIMEOUT_MS: 30000");
			expect(sandbox).toContain("SANDBOX_MAX_PROCESSES: 32");
			expect(sandbox).toContain("SANDBOX_MAX_CPU_SECONDS: 20");
		}
	});
});
