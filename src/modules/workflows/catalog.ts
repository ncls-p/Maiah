import type { WorkflowNodeType } from "./contracts";

export type WorkflowNodeFieldOption = {
  value: string;
  label: string;
};

export type WorkflowNodeField = {
  key: string;
  control:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "json"
    | "keyValue"
    | "stringList"
    | "agent"
    | "code";
  label: string;
  description?: string;
  placeholder?: string;
  options?: readonly WorkflowNodeFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  advanced?: boolean;
  showWhen?: { key: string; equals: unknown };
};

export type WorkflowNodeCatalogItem = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: "trigger" | "data" | "logic" | "integration" | "ai" | "code";
  defaultParameters: Record<string, unknown>;
  fields: readonly WorkflowNodeField[];
};

const pathField = (key = "path"): WorkflowNodeField => ({
  key,
  control: "text",
  label: key,
  description: "pathHint",
  placeholder: "pathPlaceholder",
});

const outputPathField: WorkflowNodeField = {
  key: "outputPath",
  control: "text",
  label: "outputPath",
  description: "outputPathHint",
  placeholder: "outputPathPlaceholder",
};

const comparisonOptions = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "notEquals" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "startsWith" },
  { value: "greaterThan", label: "greaterThan" },
  { value: "lessThan", label: "lessThan" },
  { value: "exists", label: "exists" },
  { value: "isEmpty", label: "isEmpty" },
] as const;

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodeCatalogItem[] = [
  {
    type: "trigger.manual",
    label: "Déclencheur API",
    description: "Reçoit le JSON envoyé lors du lancement.",
    category: "trigger",
    defaultParameters: {},
    fields: [],
  },
  {
    type: "agent.run",
    label: "Exécuter un assistant",
    description: "Confie une étape à un assistant Maiah.",
    category: "ai",
    defaultParameters: {
      agentId: "",
      prompt: "Traite cette entrée :\n{{input}}",
    },
    fields: [
      { key: "agentId", control: "agent", label: "agent" },
      {
        key: "prompt",
        control: "textarea",
        label: "prompt",
        description: "templateHint",
      },
    ],
  },
  {
    type: "http.request",
    label: "Requête HTTP",
    description: "Appelle une API HTTPS et renvoie sa réponse.",
    category: "integration",
    defaultParameters: {
      method: "GET",
      url: "https://api.example.com",
      query: {},
      headers: {},
    },
    fields: [
      {
        key: "method",
        control: "select",
        label: "method",
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        key: "url",
        control: "text",
        label: "url",
        placeholder: "urlPlaceholder",
      },
      {
        key: "query",
        control: "keyValue",
        label: "query",
        description: "templateHint",
      },
      {
        key: "headers",
        control: "keyValue",
        label: "headers",
        description: "templateHint",
        advanced: true,
      },
      {
        key: "body",
        control: "json",
        label: "body",
        description: "bodyHint",
        advanced: true,
      },
    ],
  },
  {
    type: "data.set",
    label: "Définir des données",
    description: "Ajoute ou remplace des champs dans l’entrée.",
    category: "data",
    defaultParameters: { values: { status: "ready" } },
    fields: [
      {
        key: "values",
        control: "keyValue",
        label: "values",
        description: "templateHint",
      },
    ],
  },
  {
    type: "data.pick",
    label: "Garder des champs",
    description: "Ne conserve que les champs choisis.",
    category: "data",
    defaultParameters: { paths: ["message"] },
    fields: [
      {
        key: "paths",
        control: "stringList",
        label: "paths",
        description: "pathsHint",
      },
    ],
  },
  {
    type: "data.remove",
    label: "Supprimer des champs",
    description: "Retire des champs sans écrire de code.",
    category: "data",
    defaultParameters: { paths: ["temporary"] },
    fields: [
      {
        key: "paths",
        control: "stringList",
        label: "paths",
        description: "pathsHint",
      },
    ],
  },
  {
    type: "data.rename",
    label: "Renommer un champ",
    description: "Déplace une valeur vers un nouveau chemin.",
    category: "data",
    defaultParameters: { from: "oldName", to: "newName" },
    fields: [pathField("from"), pathField("to")],
  },
  {
    type: "data.template",
    label: "Créer depuis un modèle",
    description: "Compose du texte avec les données précédentes.",
    category: "data",
    defaultParameters: {
      template: "Bonjour {{name}}",
      outputPath: "message",
    },
    fields: [
      {
        key: "template",
        control: "textarea",
        label: "template",
        description: "templateHint",
      },
      outputPathField,
    ],
  },
  {
    type: "data.parseJson",
    label: "Lire du JSON",
    description: "Convertit un texte JSON en données structurées.",
    category: "data",
    defaultParameters: { path: "body", outputPath: "parsed" },
    fields: [pathField(), outputPathField],
  },
  {
    type: "data.stringifyJson",
    label: "Convertir en JSON",
    description: "Convertit des données structurées en texte JSON.",
    category: "data",
    defaultParameters: { path: "", outputPath: "json" },
    fields: [pathField(), outputPathField],
  },
  {
    type: "text.transform",
    label: "Transformer du texte",
    description: "Nettoie, change la casse ou remplace du texte.",
    category: "data",
    defaultParameters: {
      path: "message",
      operation: "trim",
      outputPath: "message",
    },
    fields: [
      pathField(),
      {
        key: "operation",
        control: "select",
        label: "operation",
        options: ["trim", "uppercase", "lowercase", "replace"].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        key: "search",
        control: "text",
        label: "searchText",
        showWhen: { key: "operation", equals: "replace" },
      },
      {
        key: "replacement",
        control: "text",
        label: "replacement",
        showWhen: { key: "operation", equals: "replace" },
      },
      outputPathField,
    ],
  },
  {
    type: "number.calculate",
    label: "Calculer",
    description: "Effectue un calcul numérique simple.",
    category: "data",
    defaultParameters: {
      path: "amount",
      operation: "add",
      operand: 0,
      outputPath: "result",
    },
    fields: [
      pathField(),
      {
        key: "operation",
        control: "select",
        label: "operation",
        options: [
          "add",
          "subtract",
          "multiply",
          "divide",
          "modulo",
          "round",
        ].map((value) => ({ value, label: value })),
      },
      { key: "operand", control: "number", label: "operand" },
      outputPathField,
    ],
  },
  {
    type: "list.filter",
    label: "Filtrer une liste",
    description: "Garde les éléments correspondant à une règle.",
    category: "data",
    defaultParameters: {
      path: "items",
      field: "status",
      operator: "equals",
      value: "active",
      outputPath: "items",
    },
    fields: [
      pathField(),
      pathField("field"),
      {
        key: "operator",
        control: "select",
        label: "operator",
        options: comparisonOptions,
      },
      { key: "value", control: "json", label: "expectedValue" },
      outputPathField,
    ],
  },
  {
    type: "list.sort",
    label: "Trier une liste",
    description: "Trie une liste par champ et direction.",
    category: "data",
    defaultParameters: {
      path: "items",
      field: "createdAt",
      direction: "ascending",
      outputPath: "items",
    },
    fields: [
      pathField(),
      pathField("field"),
      {
        key: "direction",
        control: "select",
        label: "direction",
        options: ["ascending", "descending"].map((value) => ({
          value,
          label: value,
        })),
      },
      outputPathField,
    ],
  },
  {
    type: "list.slice",
    label: "Limiter une liste",
    description: "Extrait une portion d’une liste.",
    category: "data",
    defaultParameters: {
      path: "items",
      start: 0,
      limit: 10,
      outputPath: "items",
    },
    fields: [
      pathField(),
      { key: "start", control: "number", label: "start", min: 0 },
      { key: "limit", control: "number", label: "limit", min: 1, max: 10_000 },
      outputPathField,
    ],
  },
  {
    type: "logic.condition",
    label: "Condition",
    description: "Dirige le flux vers les sorties vrai ou faux.",
    category: "logic",
    defaultParameters: { path: "status", operator: "equals", value: "ready" },
    fields: [
      pathField(),
      {
        key: "operator",
        control: "select",
        label: "operator",
        options: comparisonOptions,
      },
      { key: "value", control: "json", label: "expectedValue" },
    ],
  },
  {
    type: "logic.delay",
    label: "Attendre",
    description: "Suspend le workflow pendant une courte durée.",
    category: "logic",
    defaultParameters: { delayMs: 1_000 },
    fields: [
      {
        key: "delayMs",
        control: "number",
        label: "delay",
        min: 0,
        max: 60_000,
        step: 100,
      },
    ],
  },
  {
    type: "logic.stop",
    label: "Terminer le workflow",
    description: "Marque explicitement la fin d’une branche.",
    category: "logic",
    defaultParameters: { message: "Workflow terminé" },
    fields: [{ key: "message", control: "text", label: "resultMessage" }],
  },
  {
    type: "date.now",
    label: "Date actuelle",
    description: "Ajoute la date ou l’horodatage courant.",
    category: "data",
    defaultParameters: { format: "iso", outputPath: "now" },
    fields: [
      {
        key: "format",
        control: "select",
        label: "format",
        options: ["iso", "timestamp", "date"].map((value) => ({
          value,
          label: value,
        })),
      },
      outputPathField,
    ],
  },
  {
    type: "code.execute",
    label: "Code personnalisé",
    description: "Exécute du JavaScript ou Python dans le bac à sable.",
    category: "code",
    defaultParameters: {
      language: "node",
      code: "const chunks = [];\nfor await (const chunk of process.stdin) chunks.push(chunk);\nconst input = JSON.parse(Buffer.concat(chunks).toString() || 'null');\nconsole.log(JSON.stringify({ input, processed: true }));",
    },
    fields: [
      {
        key: "language",
        control: "select",
        label: "language",
        options: [
          { value: "node", label: "javascript" },
          { value: "python", label: "python" },
        ],
      },
      { key: "code", control: "code", label: "code" },
    ],
  },
] as const;

export const WORKFLOW_NODE_CATEGORIES = [
  "all",
  "trigger",
  "ai",
  "integration",
  "data",
  "logic",
  "code",
] as const;

export type WorkflowNodeCategory = (typeof WORKFLOW_NODE_CATEGORIES)[number];

export function workflowNodeCatalogItem(type: WorkflowNodeType) {
  const item = WORKFLOW_NODE_CATALOG.find(
    (candidate) => candidate.type === type,
  );
  if (!item) throw new Error(`Unknown workflow node type: ${type}`);
  return item;
}
