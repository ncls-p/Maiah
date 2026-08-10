import {
  comparisonOptions,
  outputPathField,
  pathField,
} from "./catalog.workflow-node-field-option";
export const WORKFLOW_NODE_CATALOGPart2 = [
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
    type: "debug.snapshot",
    label: "Inspecter les données",
    description:
      "Capture l’entrée de cette étape dans le détail du run sans la modifier.",
    category: "code",
    defaultParameters: {
      note: "Vérifier les données à cet endroit",
    },
    fields: [
      {
        key: "note",
        control: "text",
        label: "debugNote",
        description: "debugNoteHint",
      },
    ],
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
