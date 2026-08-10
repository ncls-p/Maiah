import {
  outputPathField,
  pathField,
} from "./catalog.workflow-node-field-option";
export const WORKFLOW_NODE_CATALOGPart1 = [
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
] as const;
