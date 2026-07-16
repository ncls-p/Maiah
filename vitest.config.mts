import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: ["test/**/*.test.ts"],
		exclude: ["test/e2e/**"],
		setupFiles: ["./test/setup-env.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: [
				"src/lib/**/*.ts",
				"src/modules/**/*.ts",
				"src/server/domain/**/*.ts",
			],
			exclude: [
				"src/**/*.d.ts",
				"src/server/infrastructure/**",
				"src/app/**",
				"src/components/**",
				"src/hooks/**",
				"src/i18n/**",
				"src/middleware.ts",
				"src/lib/rich-clipboard.ts",
				// External-service orchestration is covered by focused unit/integration-style tests,
				// but excluded from global V8 thresholds because exhaustive branch coverage
				// depends on GitHub, n8n/MCP, AI provider, and DB workflow permutations.
				"src/modules/agent/use-cases.ts",
				"src/modules/chat/automation.ts",
				"src/modules/custom-tools/use-cases.ts",
				"src/modules/github/publishing.ts",
				"src/modules/knowledge/use-cases.ts",
				// The OpenAI proxy boundary is exercised end-to-end with the official SDK.
				// These files coordinate request auth, database/provider resolution, quotas,
				// usage recording, and the external AI SDK rather than pure domain logic.
				"src/modules/openai-proxy/auth.ts",
				"src/modules/openai-proxy/model-catalog.ts",
				"src/modules/openai-proxy/service.ts",
				"src/modules/tool-connections/use-cases.ts",
				"src/proxy.ts",
			],
			thresholds: {
				statements: 95,
				branches: 79,
				functions: 90,
				lines: 95,
			},
		},
	},
});
