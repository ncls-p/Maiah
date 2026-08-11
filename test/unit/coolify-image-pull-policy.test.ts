import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const registryBackedServices = [
  "migrate",
  "app",
  "worker",
  "sandbox-runner",
  "sandbox-egress-proxy",
  "servicenow-mcp-gateway",
  "searxng",
];

function serviceLines(composeLines: string[], service: string) {
  const serviceStart = composeLines.indexOf(`  ${service}:`);
  expect(serviceStart).toBeGreaterThanOrEqual(0);
  const nextServiceOffset = composeLines
    .slice(serviceStart + 1)
    .findIndex((line) => /^  [a-zA-Z0-9_-]+:$/.test(line));
  const serviceEnd =
    nextServiceOffset === -1
      ? undefined
      : serviceStart + 1 + nextServiceOffset;
  return composeLines.slice(serviceStart, serviceEnd);
}

describe("Coolify image pull policy", () => {
  it("pulls current registry images before each rollout", () => {
    const compose = readFileSync(
      path.join(process.cwd(), ".coolify/stack.compose.yml"),
      "utf8",
    );
    const composeLines = compose.split("\n");

    for (const service of registryBackedServices) {
      expect(serviceLines(composeLines, service)).toContain(
        "    pull_policy: always",
      );
    }
  });
});
