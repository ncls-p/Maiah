// Anti-regression code-size gate.
//
// Replaces the flat "every file <= 300 lines" rule (which produced mechanical
// part-a/section-N splits) with metrics that measure what actually matters:
//
//   1. File ratchet — every file recorded in scripts/file-size-ratchet.json
//      may shrink but must not grow. Files not in the ratchet must stay
//      within the default caps.
//   2. Function gate — per-function cyclomatic complexity and length,
//      measured with the TypeScript compiler API, capped by the defaults.
//      Files recorded in the ratchet keep their current worst values as
//      their individual caps.
//
// Usage:
//   node scripts/check-code-size.mjs             check (fails on violation)
//   node scripts/check-code-size.mjs --update    re-seed the ratchet from the
//                                                current state (run after an
//                                                approved consolidation)
//   node scripts/check-code-size.mjs --report    print worst offenders,
//                                                never fails
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const DEFAULTS = {
    fileLines: 300,
    functionComplexity: 30,
    functionLines: 200,
};

const RATCHET_PATH = new URL("./file-size-ratchet.json", import.meta.url);
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
const PARSEABLE_EXTENSIONS = new Set([
    ".cjs",
    ".js",
    ".jsx",
    ".mjs",
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

function scriptKindFor(filePath) {
    switch (path.extname(filePath)) {
        case ".tsx":
            return ts.ScriptKind.TSX;
        case ".jsx":
            return ts.ScriptKind.JSX;
        case ".ts":
            return ts.ScriptKind.TS;
        default:
            return ts.ScriptKind.JS;
    }
}

const FUNCTION_KINDS = new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
]);
const DECISION_KINDS = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoWhileStatement,
    ts.SyntaxKind.CaseClause,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.ConditionalExpression,
]);

// Single-pass tree walk yielding [node, isExit] events: children in
// pre-order, exit markers in post-order.
function* iterTree(root) {
    const stack = [[root, false]];
    while (stack.length > 0) {
        const item = stack.pop();
        const node = item[0];
        const isExit = item[1];
        yield [node, isExit];
        if (isExit) continue;
        stack.push([node, true]);
        const children = [];
        ts.forEachChild(node, (child) => {
            children.push(child);
        });
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push([children[i], false]);
        }
    }
}

function measureFunctions(filePath, text) {
    const sourceFile = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(filePath),
    );
    let maxComplexity = 0;
    let maxLines = 0;
    const frameStack = [];

    for (const [node, isExit] of iterTree(sourceFile)) {
        if (FUNCTION_KINDS.has(node.kind)) {
            if (isExit) {
                const frame = frameStack.pop();
                const endLine =
                    sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
                const lines = endLine - frame.startLine + 1;
                if (frame.complexity > maxComplexity) {
                    maxComplexity = frame.complexity;
                }
                if (lines > maxLines) maxLines = lines;
            } else {
                const startLine =
                    sourceFile.getLineAndCharacterOfPosition(
                        node.getStart(sourceFile),
                    ).line;
                frameStack.push({ startLine, complexity: 1 });
            }
            continue;
        }
        if (isExit || frameStack.length === 0) continue;
        const frame = frameStack[frameStack.length - 1];
        if (DECISION_KINDS.has(node.kind)) {
            frame.complexity += 1;
        } else if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const op = node.operatorToken.kind;
            if (
                op === ts.SyntaxKind.AmpersandAmpersandToken ||
                op === ts.SyntaxKind.PipePipeToken ||
                op === ts.SyntaxKind.QuestionQuestionToken
            ) {
                frame.complexity += 1;
            }
        }
    }

    return { maxComplexity, maxLines };
}

async function scan() {
    const files = (
        await Promise.all(SOURCE_ROOTS.map((root) => collectSourceFiles(root)))
    ).flat();
    const measurements = new Map();

    for (const filePath of files) {
        const text = await readFile(filePath, "utf8");
        const lines = text === "" ? 0 : text.split(/\r?\n/u).length;
        const entry = { lines };
        if (PARSEABLE_EXTENSIONS.has(path.extname(filePath))) {
            const functions = measureFunctions(filePath, text);
            entry.maxFunctionComplexity = functions.maxComplexity;
            entry.maxFunctionLines = functions.maxLines;
        }
        measurements.set(filePath, entry);
    }

    return measurements;
}

function buildRatchet(measurements) {
    const files = {};
    for (const [filePath, entry] of [...measurements.entries()].sort(
        (a, b) => a[0].localeCompare(b[0]),
    )) {
        const record = {};
        if (entry.lines > DEFAULTS.fileLines) record.lines = entry.lines;
        if ((entry.maxFunctionComplexity ?? 0) > DEFAULTS.functionComplexity) {
            record.maxFunctionComplexity = entry.maxFunctionComplexity;
        }
        if ((entry.maxFunctionLines ?? 0) > DEFAULTS.functionLines) {
            record.maxFunctionLines = entry.maxFunctionLines;
        }
        if (Object.keys(record).length > 0) files[filePath] = record;
    }
    return {
        version: 1,
        defaults: DEFAULTS,
        files,
    };
}

async function loadRatchet() {
    try {
        const raw = await readFile(RATCHET_PATH, "utf8");
        return JSON.parse(raw);
    } catch {
        return { version: 1, defaults: DEFAULTS, files: {} };
    }
}

function check(measurements, ratchet) {
    const violations = [];
    for (const [filePath, entry] of measurements) {
        const limits = ratchet.files[filePath] ?? {};
        const limitsCheck = [
            [
                "lines",
                entry.lines,
                limits.lines ?? DEFAULTS.fileLines,
                "lines",
            ],
            [
                "maxFunctionComplexity",
                entry.maxFunctionComplexity ?? 0,
                limits.maxFunctionComplexity ??
                    DEFAULTS.functionComplexity,
                "function complexity",
            ],
            [
                "maxFunctionLines",
                entry.maxFunctionLines ?? 0,
                limits.maxFunctionLines ?? DEFAULTS.functionLines,
                "function lines",
            ],
        ];
        for (const [metric, value, limit, label] of limitsCheck) {
            if (value > limit) {
                violations.push({ filePath, metric, value, limit, label });
            }
        }
    }
    return violations;
}

const mode = process.argv.includes("--update")
    ? "update"
    : process.argv.includes("--report")
      ? "report"
      : "check";

const measurements = await scan();

if (mode === "update") {
    const ratchet = buildRatchet(measurements);
    await writeFile(
        RATCHET_PATH,
        `${JSON.stringify(ratchet, null, 4)}\n`,
        "utf8",
    );
    console.log(
        `Ratchet updated: ${Object.keys(ratchet.files).length} files exceed the defaults and are now ratcheted.`,
    );
    process.exit(0);
}

const ratchet = await loadRatchet();
const violations = check(measurements, ratchet);

if (mode === "report") {
    const byWorst = [...measurements.entries()]
        .map(([filePath, entry]) => ({
            filePath,
            ...entry,
            score:
                entry.lines +
                (entry.maxFunctionComplexity ?? 0) * 4 +
                (entry.maxFunctionLines ?? 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);
    for (const row of byWorst) {
        console.log(
            `${String(row.lines).padStart(5)}L  ` +
                `c=${String(row.maxFunctionComplexity ?? "-").padStart(3)}  ` +
                `f=${String(row.maxFunctionLines ?? "-").padStart(4)}  ` +
                `${row.filePath}`,
        );
    }
    process.exit(0);
}

if (violations.length > 0) {
    violations.sort((a, b) => b.value - b.limit - (a.value - a.limit));
    console.error("Code-size ratchet violations:");
    for (const v of violations) {
        console.error(
            `- ${v.filePath}: ${v.label} ${v.value} (ratchet: ${v.limit})`,
        );
    }
    console.error(
        "\nFix the code, or run `npm run quality:size:update` to re-ratchet after an approved consolidation.",
    );
    process.exitCode = 1;
} else {
    console.log(
        `Code-size gate OK: no file or function exceeds its ratchet ` +
            `(defaults: ${DEFAULTS.fileLines} file lines, ` +
            `${DEFAULTS.functionComplexity} function complexity, ` +
            `${DEFAULTS.functionLines} function lines).`,
    );
}