import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

// Read types, never execute route modules or connect to production services.
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const program = ts.createProgram(
  parsed.fileNames.filter((f) => f.includes("/src/")),
  parsed.options,
);
const checker = program.getTypeChecker();
const manifest = await readFile(
  "src/modules/openapi/generated-route-manifest.ts",
  "utf8",
);
const moduleText = ts.transpileModule(manifest, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { OPENAPI_ROUTE_MANIFEST: routes } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleText).toString("base64")}`
);

function schema(type, at, seen = new Set(), depth = 0) {
  if (depth > 16 || seen.has(type)) return {};
  const next = new Set(seen).add(type);
  if (type.flags & ts.TypeFlags.StringLiteral)
    return { type: "string", const: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral)
    return { type: "number", const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral)
    return { type: "boolean", const: type.intrinsicName === "true" };
  if (type.flags & ts.TypeFlags.String) return { type: "string" };
  if (type.flags & ts.TypeFlags.Number) return { type: "number" };
  if (type.flags & ts.TypeFlags.Boolean) return { type: "boolean" };
  if (type.flags & ts.TypeFlags.Null) return { type: "null" };
  if (type.isUnion()) {
    const parts = type.types
      .filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Never)))
      .map((t) => schema(t, at, next, depth + 1));
    if (parts.length === 1) return parts[0];
    if (parts.every((p) => "const" in p))
      return { enum: parts.map((p) => p.const) };
    return { anyOf: parts };
  }
  if (checker.isArrayType(type))
    return {
      type: "array",
      items: schema(checker.getTypeArguments(type)[0], at, next, depth + 1),
    };
  if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return {};
  const properties = {};
  const required = [];
  for (const prop of type.getProperties()) {
    const field = checker.getTypeOfSymbolAtLocation(prop, at);
    properties[prop.name] = schema(field, at, next, depth + 1);
    if (
      !(prop.flags & ts.SymbolFlags.Optional) &&
      !(
        field.isUnion() &&
        field.types.some((t) => t.flags & ts.TypeFlags.Undefined)
      )
    )
      required.push(prop.name);
  }
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: index ? schema(index, at, next, depth + 1) : false,
  };
}
function walk(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}
const contracts = {};
for (const route of routes) {
  if (route.bodyKind === "none") continue;
  const file = `src/app${route.path.replaceAll(/\{([^}]+)\}/g, "[$1]")}/route.ts`;
  const source = program.getSourceFile(path.resolve(file));
  if (!source) continue;
  const sourceModule = checker.getSymbolAtLocation(source);
  let symbol =
    sourceModule &&
    checker
      .getExportsOfModule(sourceModule)
      .find((s) => s.name === route.method);
  if (symbol?.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol);
  const handler = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!handler) continue;
  const bodyVariables = new Set();
  walk(handler, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      /(?:req|request)\.json\(/.test(n.initializer.getText())
    )
      bodyVariables.add(n.name.text);
  });
  walk(handler, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isPropertyAccessExpression(n.expression) ||
      !/^(safeParse|parse)$/.test(n.expression.name.text)
    )
      return;
    const argument = n.arguments[0];
    if (
      !argument ||
      (!/(?:req|request)\.json\(/.test(argument.getText()) &&
        !argument
          .getText()
          .split(/\W+/)
          .some((name) => bodyVariables.has(name)))
    )
      return;
    const type = checker.getTypeAtLocation(n.expression.expression);
    const input = type.getProperty("_input");
    if (input)
      contracts[route.operationId] = schema(
        checker.getTypeOfSymbolAtLocation(input, n),
        n,
      );
  });
}
// Validators called inside services rather than directly in the HTTP handler.
for (const [operationId, file, name] of [
  [
    "putOrganizationsOrganizationIdGenesys",
    "src/modules/genesys/contracts.ts",
    "connectionInput",
  ],
]) {
  const source = program.getSourceFile(path.resolve(file));
  walk(source, (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== name) return;
    const type = checker.getTypeAtLocation(node.name);
    const input = type.getProperty("_input");
    if (input)
      contracts[operationId] = schema(
        checker.getTypeOfSymbolAtLocation(input, node),
        node,
      );
  });
}
const missingContracts = routes.filter(
  (route) => route.bodyKind === "json" && !contracts[route.operationId],
);
if (missingContracts.length)
  throw new Error(
    `Missing MCP input contracts: ${missingContracts.map((route) => route.operationId).join(", ")}`,
  );
const output = "src/modules/maiah-mcp/generated-contracts.ts";
const contents = await format(
  `// Generated by scripts/generate-mcp-contracts.mjs. Do not edit.\n// Types are discovery hints; route validators remain authoritative for refinements and limits.\nexport const MCP_BODY_CONTRACTS: Record<string, Record<string, unknown>> = ${JSON.stringify(contracts)};\n`,
  { parser: "typescript" },
);
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8").catch(() => "")) !== contents) {
    console.error("MCP contracts are stale. Run npm run mcp:generate.");
    process.exitCode = 1;
  }
} else await writeFile(output, contents);
console.log(
  `${routes.filter((r) => r.bodyKind === "json" && contracts[r.operationId]).length}/${routes.filter((r) => r.bodyKind === "json").length} JSON actions have inferred input contracts.`,
);

const pages = parsed.fileNames
  .filter((f) => /src\/app\/\[locale\]\/\(workspace\)\/.*\/page.tsx$/.test(f))
  .map((f) => f.split("/(workspace)")[1].replace(/\/page.tsx$/, ""))
  .sort();
const pageFile = "src/modules/companion/generated-pages.ts";
const pageContents = await format(
  `// Generated by scripts/generate-mcp-contracts.mjs.
export const APPLICATION_PAGES = ${JSON.stringify(pages)} as const;\n`,
  { parser: "typescript" },
);
if (process.argv.includes("--check")) {
  if ((await readFile(pageFile, "utf8").catch(() => "")) !== pageContents) {
    console.error("Companion page catalog is stale. Run npm run mcp:generate.");
    process.exitCode = 1;
  }
} else await writeFile(pageFile, pageContents);

const exclusionSource = ts.transpileModule(
  await readFile("src/modules/maiah-mcp/action-availability.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { actionExclusion } = await import(
  `data:text/javascript;base64,${Buffer.from(exclusionSource).toString("base64")}`
);
const matrix = [
  "# MCP action coverage",
  "",
  "Generated by `npm run mcp:generate`; checked in CI. Authorization is rechecked by each HTTP route. Input types are discovery hints; route refinements remain authoritative.",
  "",
  "Multipart uploads accept inline base64 up to 180 KB. Larger files use the existing upload UI. Downloads return an authenticated link. Long jobs use their existing create/status/cancel endpoints; mutations are never automatically replayed.",
  "",
  "| Action | Session | API token | Input | Exclusion |",
  "| --- | --- | --- | --- | --- |",
  ...routes.map((route) => {
    const exclusion = actionExclusion(route.path);
    const supports = (auth) =>
      !exclusion && route.auth.includes(auth) ? "yes" : "—";
    return `| ${route.method} ${route.path} | ${supports("session")} | ${supports("apiKey")} | ${route.bodyKind === "json" ? (contracts[route.operationId] ? "inferred JSON" : "untyped JSON") : route.bodyKind} | ${exclusion ?? (route.auth.some((a) => ["session", "apiKey"].includes(a)) ? "" : "Public or special authentication")} |`;
  }),
  "",
].join("\n");
const matrixFile = "docs/architecture/mcp-action-coverage.md";
if (process.argv.includes("--check")) {
  if ((await readFile(matrixFile, "utf8").catch(() => "")) !== matrix) {
    console.error("MCP action coverage is stale");
    process.exitCode = 1;
  }
} else await writeFile(matrixFile, matrix);
