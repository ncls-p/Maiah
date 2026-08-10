import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_LINES = 300;
// Prettier exposes a small set of legacy files that already exceed the target.
// Keep their formatted size as a ratchet: they may shrink, but not grow.
const LEGACY_LINE_LIMITS = new Map([
  [
    "src/app/[locale]/(workspace)/agents/[agentId]/capabilities-tab.capabilities-tab.tsx",
    395,
  ],
  ["src/app/[locale]/(workspace)/agents/[agentId]/essential-tab.view.tsx", 309],
  [
    "src/app/[locale]/(workspace)/agents/[agentId]/page.agent-configure-page.tsx",
    416,
  ],
  [
    "src/app/[locale]/(workspace)/agents/[agentId]/page.use-agent-configuration-data.ts",
    371,
  ],
  ["src/app/[locale]/(workspace)/agents/page.agents-page.tsx", 341],
  [
    "src/app/[locale]/(workspace)/agents/page.agents-page.view.section-2.tsx",
    448,
  ],
  ["src/app/[locale]/(workspace)/chat/page.chat-page.tsx", 496],
  ["src/app/[locale]/(workspace)/chat/page.use-chat-directory.ts", 369],
  ["src/app/[locale]/(workspace)/chat/page.use-chat-session.ts", 423],
  ["src/app/[locale]/(workspace)/knowledge/page.knowledge-page.tsx", 478],
  ["src/app/[locale]/(workspace)/marketplace/items/[itemId]/page.tsx", 312],
  ["src/app/[locale]/(workspace)/marketplace/page.marketplace-page.tsx", 350],
  [
    "src/app/api/workspace/[agentId]/chat/route-support.build-bound-tools.ts",
    383,
  ],
  ["src/app/api/workspace/[agentId]/chat/route.post.ts", 396],
  ["src/app/api/workspace/[agentId]/chat/route.prepare-conversation.ts", 403],
  ["src/app/api/workspace/[agentId]/chat/route.standard.ts", 393],
  ["src/app/api/workspace/conversations/route.get.ts", 309],
  [
    "src/components/admin/assistant-governance-settings.assistant-governance-settings.tsx",
    415,
  ],
  [
    "src/components/admin/chat-automation-settings.chat-automation-settings.tsx",
    313,
  ],
  [
    "src/components/admin/sidebar-navigation-settings.sidebar-navigation-settings.tsx",
    323,
  ],
  ["src/components/chat/chat-message-list.chat-message-list.view.tsx", 318],
  ["src/components/chat/chat-message-rendering.tool-part-card.tsx", 524],
  ["src/components/chat/chat-sidebar.chat-sidebar.tsx", 460],
  ["src/components/chat/chat-tools-menu.chat-tools-menu.tsx", 606],
  ["src/components/chat/conversation-share-dialog.tsx", 305],
  [
    "src/components/chat/github-publish-dialog.git-hub-publish-dialog.view.section-1.tsx",
    366,
  ],
  ["src/components/iam/access-console.access-console.tsx", 452],
  [
    "src/components/iam/access-console.access-console.view.section-1.section-1.section-2.tsx",
    425,
  ],
  [
    "src/components/iam/access-console.access-console.view.section-1.section-3.branch-2.tsx",
    351,
  ],
  [
    "src/components/iam/access-console.access-console.view.section-1.section-3.branch-4.tsx",
    386,
  ],
  ["src/components/iam/access-console.resource-access-panel.tsx", 372],
  [
    "src/components/iam/access-console.resource-access-panel.view.section-1.tsx",
    466,
  ],
  [
    "src/components/iam/scope-migration-dialog.scope-migration-dialog.view.section-1.tsx",
    307,
  ],
  [
    "src/components/marketplace/resource-share-dialog.resource-share-dialog.tsx",
    344,
  ],
  [
    "src/components/mcp/mcp-server-manager/tool-connections-panel.tool-connections-panel.tsx",
    388,
  ],
  ["src/components/mcp/mcp-server-manager.mcp-server-manager.tsx", 416],
  ["src/components/providers/provider-manager.tsx", 415],
  ["src/components/skills/skill-manager.skill-editor-dialog.tsx", 367],
  [
    "src/components/workflows/workflow-agentic-panel.workflow-agentic-panel.tsx",
    459,
  ],
  ["src/components/workflows/workflow-builder.use-agentic-editor.ts", 430],
  ["src/components/workflows/workflow-builder.workflow-builder.tsx", 392],
  ["src/components/workflows/workflow-builder.workflow-builder.view.tsx", 316],
  ["src/components/workspace-api-keys.workspace-api-keys.tsx", 447],
  ["src/components/workspace-history-sidebar.use-workspace-history.tsx", 354],
  ["src/hooks/use-chat-stream-events.apply-stream-event.ts", 320],
  ["src/hooks/use-chat-stream.submit.ts", 377],
  ["src/hooks/use-chat-stream.use-chat-stream.ts", 371],
  ["src/modules/agent/runtime-executor.build-delegation-tools.ts", 316],
  ["src/modules/agent/runtime-executor.execute-resolved-agent.ts", 474],
  ["src/modules/agent/use-cases.update-agent-unlocked.ts", 440],
  ["src/modules/chat/stream-bus.create-chat-uimessage-stream-response.ts", 310],
  ["src/modules/custom-tools/use-cases.custom-tool-builder-tools.ts", 320],
  ["src/modules/github/publishing.publish-code-workspace-to-git-hub.ts", 356],
  ["src/modules/iam/resource-transfer.apply-transaction.ts", 423],
  ["src/modules/iam/resource-transfer.expand-transfer-graph.ts", 437],
  ["test/e2e/chat-sharing-retention-and-preview.spec.ts", 461],
  ["test/e2e/chat.suite-3.spec.ts", 393],
]);
const SOURCE_ROOTS = ["src", "test", "scripts", "services"];
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".pcss",
  ".py",
  ".sh",
  ".ts",
  ".tsx",
]);
const EXCLUDED_SEGMENTS = new Set([
  ".next",
  "coverage",
  "migrations",
  "node_modules",
]);

function isGeneratedFile(filePath) {
  const name = path.basename(filePath);
  return name.startsWith("generated-") || name.endsWith(".generated.ts");
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !isGeneratedFile(entryPath)
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

async function countLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content === "" ? 0 : content.split(/\r?\n/u).length;
}

const files = (
  await Promise.all(SOURCE_ROOTS.map((root) => collectSourceFiles(root)))
).flat();
const violations = [];

for (const filePath of files) {
  const lines = await countLines(filePath);
  const limit = LEGACY_LINE_LIMITS.get(filePath) ?? MAX_LINES;
  if (lines > limit) violations.push({ filePath, lines, limit });
}

if (violations.length > 0) {
  violations.sort((left, right) => right.lines - left.lines);
  console.error(`Authored source files must not exceed ${MAX_LINES} lines:`);
  for (const { filePath, lines, limit } of violations) {
    console.error(`- ${filePath}: ${lines} (limit: ${limit})`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `All authored source files stay within their line-size ratchets (${MAX_LINES} by default).`,
  );
}
