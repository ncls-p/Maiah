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

    expect(nextConfig).toContain('"pdf-parse"');
    expect(nextConfig).toContain('"@napi-rs/canvas"');
    expect(nextConfig).toContain('"@firecrawl/anydoc"');
    expect(attachmentModule).toContain('import "pdf-parse/worker";');
  });

  it("pins one Next.js deployment identity across every app container", () => {
    const nextConfig = projectFile("next.config.ts");
    const dockerfile = projectFile("Dockerfile");
    const workflow = projectFile(".github/workflows/coolify.yml");

    expect(nextConfig).toContain("deploymentId");
    expect(dockerfile).toContain("ARG NEXT_DEPLOYMENT_ID");
    expect(workflow).toContain('NEXT_DEPLOYMENT_ID = "${GITHUB_SHA}"');
  });

  it("always rebuilds app images for main pushes", () => {
    const workflow = projectFile(".github/workflows/coolify.yml");

    expect(workflow).toContain('if [[ "${EVENT_NAME}" == "push" ]]; then');
    expect(workflow).toMatch(
      /if \[\[ "\$\{EVENT_NAME\}" == "push" \]\]; then\s+app_changed=true/,
    );
  });

  it("ships the document-search command used by the sandbox instructions", () => {
    const dockerfile = projectFile("Dockerfile");
    const sandboxStage = dockerfile.slice(
      dockerfile.indexOf("FROM node:22-bookworm-slim AS sandbox-runner"),
      dockerfile.indexOf("FROM base AS deps"),
    );

    expect(sandboxStage).toMatch(/^\s*ripgrep\s*\\$/m);
  });

  it("ships and validates every sandbox runner module", () => {
    const dockerfile = projectFile("Dockerfile");
    const sandboxStage = dockerfile.slice(
      dockerfile.indexOf("FROM node:22-bookworm-slim AS sandbox-runner"),
      dockerfile.indexOf("FROM base AS deps"),
    );
    const workflow = projectFile(".github/workflows/coolify.yml");

    expect(sandboxStage).toContain(
      "COPY scripts/sandbox-runner*.mjs /opt/sandbox/",
    );
    expect(sandboxStage).toContain("SANDBOX_RUNNER_VALIDATE_ONLY=true node");
    expect(workflow).toContain("scripts/sandbox-runner[^/]*\\.mjs$");
    expect(workflow).toContain("Verify pushed sandbox runner image");
  });

  it("loads the ServiceNow application while building and verifying its image", () => {
    const dockerfile = projectFile(
      "services/servicenow-mcp-gateway/Dockerfile",
    );
    const workflow = projectFile(".github/workflows/coolify.yml");

    expect(dockerfile).toContain(
      "from servicenow_mcp_gateway.app import create_app",
    );
    expect(workflow).toContain(
      "from servicenow_mcp_gateway.app import create_app",
    );
    expect(workflow).toContain(
      'docker run --rm -i --entrypoint python "${SERVICENOW_GATEWAY_IMAGE}"',
    );
  });

  it("packages a complete SearXNG configuration without startup-only engines", () => {
    const dockerfile = projectFile("Dockerfile");
    const settings = projectFile("searxng/settings.yml");

    expect(dockerfile).toContain(
      "COPY searxng/limiter.toml /etc/searxng/limiter.toml",
    );
    for (const engine of ["ahmia", "torch", "wikidata"]) {
      expect(settings).toMatch(new RegExp(`^\\s+- ${engine}$`, "m"));
    }
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
      expect(sandbox).toContain("SANDBOX_MAX_PROCESSES: 0");
      expect(sandbox).toContain("SANDBOX_MAX_CPU_SECONDS: 20");
      expect(sandbox).toContain("HTTP_PROXY: http://sandbox-egress-proxy:3128");
      expect(sandbox).toContain("sandbox-egress-proxy:");
    }
  });

  it("keeps sandbox web access on an isolated, bounded egress path", () => {
    const dockerfile = projectFile("Dockerfile");
    for (const composeFile of [
      "docker-compose.dev.yml",
      "docker-compose.prod.yml",
    ]) {
      const compose = projectFile(composeFile);
      expect(compose).toContain("sandbox-egress:\n    internal: true");
      expect(compose).toContain("SANDBOX_EGRESS_MAX_TRANSFER_BYTES: 3000000");
      expect(compose).toContain('user: "10002:10002"');
      expect(compose).not.toMatch(/sandbox-runner:[\s\S]*?network_mode: none/);
    }
    expect(dockerfile).toContain("/usr/bin/pip /usr/bin/pip3");
    expect(dockerfile).toContain("/usr/local/lib/node_modules/npm");
  });
});
