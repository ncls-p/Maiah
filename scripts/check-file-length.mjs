import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_LINES = 300;
const SOURCE_ROOTS = ["src", "test", "scripts", "remotion", "services"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".css", ".js", ".jsx", ".mjs", ".pcss", ".py", ".sh", ".ts", ".tsx"]);
const EXCLUDED_SEGMENTS = new Set([".next", "coverage", "migrations", "node_modules"]);

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
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !isGeneratedFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function countLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content === "" ? 0 : content.split(/\r?\n/u).length;
}

const files = (await Promise.all(SOURCE_ROOTS.map((root) => collectSourceFiles(root)))).flat();
const violations = [];

for (const filePath of files) {
  const lines = await countLines(filePath);
  if (lines > MAX_LINES) violations.push({ filePath, lines });
}

if (violations.length > 0) {
  violations.sort((left, right) => right.lines - left.lines);
  console.error(`Authored source files must not exceed ${MAX_LINES} lines:`);
  for (const { filePath, lines } of violations) {
    console.error(`- ${filePath}: ${lines}`);
  }
  process.exitCode = 1;
} else {
  console.log(`All authored source files are at most ${MAX_LINES} lines.`);
}
