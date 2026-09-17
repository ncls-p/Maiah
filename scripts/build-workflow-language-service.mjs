import { build, transform } from "esbuild";
import JSZip from "jszip";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const out = "public/vendor/workflow-editor";
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    editor: "scripts/workflow-language-service/editor.mjs",
    "ts.worker":
      "node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js",
    "editor.worker":
      "node_modules/monaco-editor/esm/vs/editor/editor.worker.js",
  },
  outdir: out,
  bundle: true,
  minify: true,
  format: "esm",
  splitting: true,
  loader: { ".ttf": "file" },
  plugins: [
    {
      name: "lsp-browser",
      setup(build) {
        build.onResolve({ filter: /^vscode-languageserver$/ }, () => ({
          path: require.resolve("vscode-languageserver/browser"),
        }));
      },
    },
  ],
});
const pythonWorker = await readFile(
  require.resolve("monaco-pyright-lsp/dist/worker.js"),
  "utf8",
);
await writeFile(
  `${out}/python.worker.js`,
  (await transform(pythonWorker, { minify: true, legalComments: "inline" }))
    .code,
);
await copyFile(
  require.resolve("monaco-pyright-lsp/LICENSE"),
  `${out}/python-LICENSE.txt`,
);
await copyFile(
  require.resolve("monaco-editor/LICENSE"),
  `${out}/monaco-LICENSE.txt`,
);

const libs = {};
async function declarations(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    // Monaco supplies its own ECMAScript libraries. Loading TypeScript's lib.dom
    // as an extra root would incorrectly expose browser globals in the sandbox.
    if (
      prefix.includes("/typescript/") &&
      /^lib(?:\..*)?\.d\.ts$/.test(entry.name)
    )
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      await declarations(file, `${prefix}/${entry.name}`);
    else if (entry.name.endsWith(".d.ts"))
      libs[`${prefix}/${entry.name}`] = await readFile(file, "utf8");
  }
}
await declarations(
  "node_modules/@types/node",
  "file:///node_modules/@types/node",
);
await declarations(
  "node_modules/undici-types",
  "file:///node_modules/undici-types",
);
const packages = (await readFile("sandbox-runner/node-packages.txt", "utf8"))
  .split("\n")
  .filter((s) => s && !s.startsWith("#"))
  .map((s) => s.replace(/@\d.*$/, ""));
const typed = [];
for (const name of packages) {
  try {
    const root = path.dirname(require.resolve(`${name}/package.json`));
    const meta = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
    if (meta.types || meta.typings) {
      await declarations(root, `file:///node_modules/${name}`);
      libs[`file:///node_modules/${name}/index.d.ts`] ??=
        `export * from './${(meta.types || meta.typings).replace(/\.d\.ts$/, "").replace(/^\.\//, "")}';`;
      typed.push(name);
    }
  } catch {
    /* Inventory remains available when a package has no bundled declarations. */
  }
}
const pythonPackages = (
  await readFile("sandbox-runner/python-requirements.txt", "utf8")
)
  .split("\n")
  .map((line) => line.split("#")[0].trim())
  .filter((line) => line && !line.startsWith("--"));
const aliases = {
  "scikit-learn": "sklearn",
  "python-docx": "docx",
  "python-pptx": "pptx",
  pillow: "PIL",
  "opencv-python-headless": "cv2",
  "scikit-image": "skimage",
  beautifulsoup4: "bs4",
  "python-magic": "magic",
  "python-dateutil": "dateutil",
  PyYAML: "yaml",
  SQLAlchemy: "sqlalchemy",
  XlsxWriter: "xlsxwriter",
  pymupdf: "fitz",
  faker: "faker",
};
const pythonModules = pythonPackages.map(
  (name) => aliases[name] ?? name.replaceAll("-", "_"),
);
const zip = await JSZip.loadAsync(
  await readFile(
    require.resolve("monaco-pyright-lsp/assets/typeshed-fallback.zip"),
  ),
);
const pythonStubs = {};
const pythonTyped = [];
for (const name of pythonModules) {
  const matches = Object.keys(zip.files).filter(
    (file) =>
      file.startsWith("stubs/") &&
      (file.includes(`/${name}/`) || file.endsWith(`/${name}.pyi`)) &&
      file.endsWith(".pyi"),
  );
  if (matches.length) {
    pythonTyped.push(name);
    for (const file of matches) {
      const parts = file.split("/").slice(2);
      let folder = pythonStubs;
      for (const part of parts.slice(0, -1)) folder = folder[part] ??= {};
      folder[parts.at(-1)] = await zip.file(file).async("string");
    }
  } else
    pythonStubs[name] = {
      "__init__.pyi":
        "from typing import Any\ndef __getattr__(name: str) -> Any: ...\n",
    };
}
await writeFile(
  `${out}/libraries.json`,
  JSON.stringify({ libs, packages, typed }),
);
// Zip mounts avoid allocating a resizable 4GB address range for every stub file
// in the browser filesystem used by the Python worker.
const packedStubs = {};
for (const [name, folder] of Object.entries(pythonStubs)) {
  if (typeof folder === "string") {
    packedStubs[name] = folder;
    continue;
  }
  const archive = new JSZip();
  function addFiles(value, prefix = "") {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string") archive.file(prefix + key, child);
      else addFiles(child, prefix + key + "/");
    }
  }
  addFiles(folder);
  packedStubs[name] = {
    zip: await archive.generateAsync({
      type: "base64",
      compression: "DEFLATE",
    }),
  };
}
await writeFile(
  `${out}/python-libraries.json`,
  JSON.stringify({
    stubs: packedStubs,
    packages: pythonModules,
    typed: pythonTyped,
  }),
);
await writeFile(
  `${out}/index.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./editor.css"><style>html,body,#editor{height:100%;margin:0;overflow:hidden}</style></head><body><div id="editor"></div><script type="module" src="./editor.js"></script></body></html>`,
);
console.log("Prepared local workflow language services.");
