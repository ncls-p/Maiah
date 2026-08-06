import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, "src/app/api");
const ROUTE_ROOTS = [{ directory: API_ROOT, prefix: "/api" }];
const OUTPUT = path.join(ROOT, "src/modules/openapi/generated-route-manifest.ts");
const CHECK_ONLY = process.argv.includes("--check");
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(absolute);
      return entry.name === "route.ts" ? [absolute] : [];
    }),
  );
  return nested.flat();
}

function openApiPath(file, routeRoot) {
  const relative = path.relative(routeRoot.directory, path.dirname(file));
  const segments = relative.split(path.sep).map((segment) => {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    if (optionalCatchAll) return `{${optionalCatchAll[1]}}`;
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return `{${catchAll[1]}}`;
    const dynamic = segment.match(/^\[(.+)\]$/);
    return dynamic ? `{${dynamic[1]}}` : segment;
  });
  return `${routeRoot.prefix}/${segments.join("/")}`.replace(/\/$/, "");
}

function exportedMethods(source) {
  const matches = source.matchAll(/^export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm);
  return [...matches].map((match) => ({
    method: match[1],
    index: match.index ?? 0,
  }));
}

function methodChunks(source) {
  const methods = exportedMethods(source);
  return methods.map((entry, index) => ({
    method: entry.method,
    source: source.slice(entry.index, methods[index + 1]?.index ?? source.length),
  }));
}

function withoutHttpHandlers(source) {
  const methods = exportedMethods(source);
  if (methods.length === 0) return source;
  let output = source.slice(0, methods[0].index);
  for (let index = 0; index < methods.length - 1; index += 1) {
    const between = source.slice(methods[index].index, methods[index + 1].index);
    const nextExport = between.lastIndexOf("\nexport ");
    if (nextExport >= 0) output += between.slice(nextExport);
  }
  return output;
}

async function readLocalModule(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    const source = await readFile(candidate, "utf8").catch(() => null);
    if (source !== null) return { file: candidate, source };
  }
  return null;
}

function importedNames(clause) {
  const names = [];
  const defaultName = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
  if (defaultName) names.push(defaultName[1]);
  const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespace) names.push(namespace[1]);
  const named = clause.match(/\{([^}]+)\}/);
  if (named) {
    for (const entry of named[1].split(",")) {
      const parts = entry.trim().split(/\s+as\s+/);
      const localName = parts.at(-1)?.trim();
      if (localName) names.push(localName);
    }
  }
  return names;
}

async function dependencySource(file, source, chunk, visited = new Set()) {
  const key = `${file}:${chunk}`;
  if (visited.has(key)) return "";
  visited.add(key);
  const dependencies = [];
  const imports = source.matchAll(/^import\s+(.+?)\s+from\s+["'](\.[^"']+)["'];?/gm);
  for (const match of imports) {
    const names = importedNames(match[1]);
    if (names.length > 0 && !names.some((name) => new RegExp(`\\b${name}\\b`).test(chunk))) continue;
    const dependency = await readLocalModule(file, match[2]);
    if (!dependency) continue;
    const supportSource = withoutHttpHandlers(dependency.source);
    dependencies.push(supportSource);
    dependencies.push(await dependencySource(dependency.file, dependency.source, supportSource, visited));
  }
  return dependencies.join("\n");
}

async function routeMethodChunks(file, source, visited = new Set()) {
  if (visited.has(file)) return [];
  visited.add(file);
  const chunks = [];
  for (const chunk of methodChunks(source)) {
    const dependencies = await dependencySource(file, source, chunk.source);
    chunks.push({ ...chunk, source: `${chunk.source}\n${dependencies}` });
  }
  const reexports = source.matchAll(/^export\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["'];?/gm);
  for (const match of reexports) {
    const methods = match[1]
      .split(",")
      .map((entry) => entry.trim().split(/\s+as\s+/).at(-1))
      .filter((name) => HTTP_METHODS.has(name));
    if (methods.length === 0) continue;
    const target = await readLocalModule(file, match[2]);
    if (!target) continue;
    const targetChunks = await routeMethodChunks(target.file, target.source, new Set(visited));
    chunks.push(...targetChunks.filter(({ method }) => methods.includes(method)));
  }
  return chunks;
}

function permissionStrings(source) {
  const permissions = new Set();
  const callPattern = /(?:require(?:Workspace|Resource)PermissionAsync|requireRequestPermissionScopeAsync|check(?:Workspace|Resource)PermissionForRequest|has(?:Workspace|Resource)PermissionForRequest|getAuthorized[A-Za-z0-9]*|require[A-Za-z0-9]*Access|handleOpenAIProxyRoute|authorization\.(?:checkPermission|hasPermission))\([\s\S]{0,420}?"([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9*]+)"/g;
  for (const match of source.matchAll(callPattern)) permissions.add(match[1]);
  return [...permissions].sort();
}

function queryParameters(source) {
  return [...new Set([...source.matchAll(/searchParams\.get\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]))].sort();
}

function pathParameters(apiPath) {
  return [...apiPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function routeTag(apiPath) {
  if (apiPath.startsWith("/api/v1/")) return "OpenAI compatible";
  const [, , first = "system", second] = apiPath.split("/");
  return first === "workspace" && second ? second : first;
}

function authModes(apiPath, source) {
  if (apiPath.startsWith("/api/v1/")) return ["apiKey"];
  if (apiPath.startsWith("/api/auth/") || apiPath === "/api/health" || apiPath === "/api/openapi") {
    return [];
  }
  if (apiPath.startsWith("/api/admin/")) return ["session"];
  if (apiPath.endsWith("/github/callback")) return ["session"];
  if (source.includes("handleRoute") || source.includes("resolveAuthContext")) {
    return ["session", "apiKey"];
  }
  if (source.includes("getSession") || source.includes("handleAdminRoute")) {
    return ["session"];
  }
  return [];
}

function operationId(method, apiPath) {
  const suffix = apiPath
    .replace(/^\/api\/(?:v1\/)?/, "")
    .replace(/[{}]/g, "")
    .split("/")
    .map((part) => part.replace(/[^A-Za-z0-9]+(.)/g, (_, char) => char.toUpperCase()))
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
  return `${method.toLowerCase()}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}

function summary(method, apiPath) {
  const action = {
    GET: "Read",
    POST: "Create or execute",
    PUT: "Replace",
    PATCH: "Update",
    DELETE: "Delete",
    HEAD: "Inspect",
    OPTIONS: "Inspect options for",
  }[method];
  return `${action} ${apiPath.replace(/^\/api\/(?:v1\/)?/, "").replaceAll("/", " · ")}`;
}

const operations = [];

for (const routeRoot of ROUTE_ROOTS) {
  const files = (await routeFiles(routeRoot.directory)).sort();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const apiPath = openApiPath(file, routeRoot);
    const chunks = await routeMethodChunks(file, source);
    const expandedSource = `${source}\n${chunks.map(({ source: chunkSource }) => chunkSource).join("\n")}`;
    const auth = authModes(apiPath, expandedSource);
    const filePermissions = permissionStrings(expandedSource);
    for (const chunk of chunks) {
      if (!HTTP_METHODS.has(chunk.method)) continue;
      const methodPermissions = permissionStrings(chunk.source);
      if (chunk.source.includes("canManageTenantGlobals") && !methodPermissions.includes("roles.manage")) {
        methodPermissions.push("roles.manage");
      }
      operations.push({
        path: apiPath,
        method: chunk.method,
        operationId: operationId(chunk.method, apiPath),
        summary: summary(chunk.method, apiPath),
        tag: routeTag(apiPath),
        auth,
        permissions: methodPermissions.length > 0 ? methodPermissions : filePermissions,
        pathParameters: pathParameters(apiPath),
        queryParameters: queryParameters(chunk.source),
        bodyKind: /(?:req|request)\.formData\(\)/.test(chunk.source) ? "multipart" : !["GET", "HEAD", "OPTIONS"].includes(chunk.method) && /(?:req|request)\.json\(\)/.test(chunk.source) ? "json" : "none",
        responseKind: /text\/event-stream|createDataStreamResponse|ReadableStream|application\/zip|application\/pdf/.test(chunk.source) ? "stream" : "json",
      });
    }
  }
}

operations.sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));

const header = `// This file is generated by scripts/generate-openapi-route-manifest.mjs.\n// Do not edit it by hand.\n\n`;
const contents = await format(`${header}export const OPENAPI_ROUTE_MANIFEST = ${JSON.stringify(operations, null, 2)} as const;\n`, { parser: "typescript" });

if (CHECK_ONLY) {
  const existing = await readFile(OUTPUT, "utf8").catch(() => "");
  if (existing !== contents) {
    console.error("OpenAPI route manifest is stale. Run npm run openapi:generate and commit the result.");
    process.exitCode = 1;
  } else {
    console.log(`OpenAPI manifest covers ${operations.length} operations.`);
  }
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, contents);
  console.log(`Generated ${operations.length} OpenAPI operations in ${OUTPUT}`);
}
