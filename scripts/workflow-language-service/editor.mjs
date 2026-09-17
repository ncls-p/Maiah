import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import "monaco-editor/esm/vs/editor/editor.all.js";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import {
  typescriptShape,
  pythonShape,
} from "../../src/components/workflows/workflow-code-context";
const workers = new Set();
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url, options) {
    super(url, options);
    workers.add(this);
    this.addEventListener("error", () => send({ type: "error" }));
  }
};
Object.assign(window, {
  MonacoEnvironment: {
    getWorker(_, label) {
      return new Worker(
        `./${label === "typescript" || label === "javascript" ? "ts" : "editor"}.worker.js`,
        { type: "module" },
      );
    },
  },
});
function send(message) {
  parent.postMessage(
    { source: "workflow-editor", ...message },
    location.origin,
  );
}
let editor;
let suppress = false;
let library;
let context;
let python;
let initializing = false;
let inputSignature;
function updateContext(next) {
  context = next;
  const signature = JSON.stringify(next.input);
  if (inputSignature === signature) return;
  inputSignature = signature;
  library?.dispose();
  library = monaco.languages.typescript.javascriptDefaults.addExtraLib(
    `export type Input = ${typescriptShape(next.input)};`,
    "file:///workflow-context.d.ts",
  );
}
async function initialize(data) {
  initializing = true;
  updateContext(data.context);
  const isPython = data.language === "python";
  const libraries = await fetch(
    isPython ? "./python-libraries.json" : "./libraries.json",
  ).then((r) => {
    if (!r.ok) throw new Error("libraries");
    return r.json();
  });
  const defaults = monaco.languages.typescript.javascriptDefaults;
  defaults.setCompilerOptions({
    allowJs: true,
    checkJs: true,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    noEmit: true,
    strict: false,
    lib: ["esnext"],
    types: ["node"],
  });
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  for (const [path, content] of Object.entries(libraries.libs ?? {}))
    defaults.addExtraLib(content, path);
  for (const name of libraries.packages.filter(
    (name) => !libraries.typed.includes(name),
  ))
    defaults.addExtraLib(
      `declare module ${JSON.stringify(name)};`,
      `file:///inventory/${name.replaceAll("/", "_")}.d.ts`,
    );
  if (isPython) {
    const { MonacoPyrightProvider } = await import("monaco-pyright-lsp");
    python = new MonacoPyrightProvider("./python.worker.js", {
      typeStubs: {
        ...Object.fromEntries(
          Object.entries(libraries.stubs).map(([name, value]) => [
            name,
            typeof value === "string"
              ? value
              : Uint8Array.from(atob(value.zip), (c) => c.charCodeAt(0)).buffer,
          ]),
        ),
        workflow_context: { "__init__.pyi": pythonShape(context.input) },
      },
    });
    await python.init(monaco);
    // This browser filesystem intentionally contains declarations, not package
    // implementations. Missing source is expected; missing imports remain errors.
    await python.lspClient.connection.sendNotification(
      "workspace/didChangeConfiguration",
      {
        settings: {
          python: {
            analysis: {
              typeshedPaths: ["/typeshed-fallback"],
              stubPath: "/typings",
              diagnosticSeverityOverrides: {
                reportMissingModuleSource: "none",
              },
            },
          },
        },
      },
    );
  }
  const model = monaco.editor.createModel(
    data.value,
    isPython ? "python" : "javascript",
    monaco.Uri.parse(`file:///workflow.${isPython ? "py" : "js"}`),
  );
  editor = monaco.editor.create(document.getElementById("editor"), {
    model,
    automaticLayout: true,
    theme: data.dark ? "vs-dark" : "vs",
    ariaLabel: data.label,
    minimap: { enabled: false },
    fontSize: 12,
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    tabSize: 2,
  });
  editor.onDidChangeModelContent(() => {
    if (!suppress) send({ type: "change", value: editor.getValue() });
  });
  if (python) {
    await python.setupDiagnostics(editor);
    await python.lspClient.updateDocVersion(data.value);
  }
  monaco.languages.registerCompletionItemProvider(
    isPython ? "python" : "javascript",
    {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: [
            {
              label: "workflow-input",
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation:
                "Read the input passed by the preceding workflow node. Its type follows the workflow graph.",
              range,
              insertText: isPython
                ? 'import json, sys\nfrom typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from workflow_context import Input\n\ninput: "Input" = json.load(sys.stdin)\n'
                : 'import { readFileSync } from "node:fs";\n/** @type {import("./workflow-context").Input} */\nconst input = JSON.parse(readFileSync(0, "utf8") || "null");\n',
            },
          ],
        };
      },
    },
  );
  monaco.editor.onDidChangeMarkers(() =>
    send({
      type: "diagnostics",
      count: monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter((m) => m.severity === monaco.MarkerSeverity.Error).length,
    }),
  );
  send({ type: "ready", typed: libraries.typed, packages: libraries.packages });
}
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data?.source !== "workflow-host"
  )
    return;
  const data = event.data;
  if (data.type === "dispose") {
    python?.stopDiagnostics();
    python?.lspClient.worker.terminate();
    editor?.dispose();
    for (const worker of workers) worker.terminate();
    return;
  }
  if (data.type === "init" && !initializing)
    void initialize(data).catch(() => send({ type: "error" }));
  if (data.type === "update" && editor) {
    if (editor.getValue() !== data.value) {
      suppress = true;
      editor.setValue(data.value);
      suppress = false;
    }
    updateContext(data.context);
    monaco.editor.setTheme(data.dark ? "vs-dark" : "vs");
  }
});
send({ type: "loaded" });

window.addEventListener("pagehide", () => {
  for (const worker of workers) worker.terminate();
});
