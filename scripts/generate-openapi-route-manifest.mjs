import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, "src/app/api");
const OUTPUT = path.join(
  ROOT,
  "src/modules/openapi/generated-route-manifest.ts",
);
const CHECK_ONLY = process.argv.includes("--check");
const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

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

function openApiPath(file) {
  const relative = path.relative(API_ROOT, path.dirname(file));
  const segments = relative.split(path.sep).map((segment) => {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    if (optionalCatchAll) return `{${optionalCatchAll[1]}}`;
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return `{${catchAll[1]}}`;
    const dynamic = segment.match(/^\[(.+)\]$/);
    return dynamic ? `{${dynamic[1]}}` : segment;
  });
  return `/api/${segments.join("/")}`.replace(/\/$/, "");
}

function exportedMethods(source) {
  const matches = source.matchAll(
    /^export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm,
  );
  return [...matches].map((match) => ({
    method: match[1],
    index: match.index ?? 0,
  }));
}

function methodChunks(source) {
  const methods = exportedMethods(source);
  return methods.map((entry, index) => ({
    method: entry.method,
    source: source.slice(
      entry.index,
      methods[index + 1]?.index ?? source.length,
    ),
  }));
}

function permissionStrings(source) {
  const permissions = new Set();
  const callPattern =
    /(?:requireWorkspacePermissionAsync|checkWorkspacePermissionForRequest|hasWorkspacePermissionForRequest|authorization\.(?:checkPermission|hasPermission))\([\s\S]{0,420}?"([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9*]+)"/g;
  for (const match of source.matchAll(callPattern)) permissions.add(match[1]);
  return [...permissions].sort();
}

function queryParameters(source) {
  return [
    ...new Set(
      [...source.matchAll(/searchParams\.get\("([A-Za-z0-9_-]+)"\)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function pathParameters(apiPath) {
  return [...apiPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function routeTag(apiPath) {
  const [, , first = "system", second] = apiPath.split("/");
  return first === "workspace" && second ? second : first;
}

function authModes(apiPath, source) {
  if (
    apiPath.startsWith("/api/auth/") ||
    apiPath === "/api/health" ||
    apiPath === "/api/openapi"
  ) {
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
    .replace(/^\/api\//, "")
    .replace(/[{}]/g, "")
    .split("/")
    .map((part) =>
      part.replace(/[^A-Za-z0-9]+(.)/g, (_, char) => char.toUpperCase()),
    )
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
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
  return `${action} ${apiPath.replace(/^\/api\//, "").replaceAll("/", " · ")}`;
}

const files = (await routeFiles(API_ROOT)).sort();
const operations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const apiPath = openApiPath(file);
  const auth = authModes(apiPath, source);
  const filePermissions = permissionStrings(source);
  for (const chunk of methodChunks(source)) {
    if (!HTTP_METHODS.has(chunk.method)) continue;
    const methodPermissions = permissionStrings(chunk.source);
    if (
      chunk.source.includes("canManageTenantGlobals") &&
      !methodPermissions.includes("roles.manage")
    ) {
      methodPermissions.push("roles.manage");
    }
    operations.push({
      path: apiPath,
      method: chunk.method,
      operationId: operationId(chunk.method, apiPath),
      summary: summary(chunk.method, apiPath),
      tag: routeTag(apiPath),
      auth,
      permissions:
        methodPermissions.length > 0 ? methodPermissions : filePermissions,
      pathParameters: pathParameters(apiPath),
      queryParameters: queryParameters(chunk.source),
      bodyKind: /(?:req|request)\.formData\(\)/.test(chunk.source)
        ? "multipart"
        : !["GET", "HEAD", "OPTIONS"].includes(chunk.method) &&
            /(?:req|request)\.json\(\)/.test(chunk.source)
          ? "json"
          : "none",
      responseKind:
        /text\/event-stream|createDataStreamResponse|ReadableStream|application\/zip|application\/pdf/.test(
          chunk.source,
        )
          ? "stream"
          : "json",
    });
  }
}

operations.sort((left, right) =>
  `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`),
);

const header = `// This file is generated by scripts/generate-openapi-route-manifest.mjs.\n// Do not edit it by hand.\n\n`;
const contents = await format(
  `${header}export const OPENAPI_ROUTE_MANIFEST = ${JSON.stringify(
    operations,
    null,
    2,
  )} as const;\n`,
  { parser: "typescript" },
);

if (CHECK_ONLY) {
  const existing = await readFile(OUTPUT, "utf8").catch(() => "");
  if (existing !== contents) {
    console.error(
      "OpenAPI route manifest is stale. Run npm run openapi:generate and commit the result.",
    );
    process.exitCode = 1;
  } else {
    console.log(`OpenAPI manifest covers ${operations.length} operations.`);
  }
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, contents);
  console.log(`Generated ${operations.length} OpenAPI operations in ${OUTPUT}`);
}
