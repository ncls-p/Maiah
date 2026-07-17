import type { WorkflowNodeType } from "./contracts";

export type WorkflowNodeCatalogItem = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: "trigger" | "logic" | "integration" | "ai";
  defaultParameters: Record<string, unknown>;
};

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodeCatalogItem[] = [
  {
    type: "trigger.manual",
    label: "Déclencheur API",
    description: "Reçoit le JSON envoyé lors du lancement.",
    category: "trigger",
    defaultParameters: {},
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
  },
  {
    type: "http.request",
    label: "Requête HTTP",
    description: "Appelle une API HTTPS et renvoie sa réponse.",
    category: "integration",
    defaultParameters: { method: "GET", url: "https://api.example.com" },
  },
  {
    type: "code.execute",
    label: "Code personnalisé",
    description: "Exécute du JavaScript ou Python dans le bac à sable.",
    category: "logic",
    defaultParameters: {
      language: "node",
      code: "const chunks = [];\nfor await (const chunk of process.stdin) chunks.push(chunk);\nconst input = JSON.parse(Buffer.concat(chunks).toString() || 'null');\nconsole.log(JSON.stringify({ input, processed: true }));",
    },
  },
  {
    type: "data.set",
    label: "Définir des données",
    description: "Ajoute ou remplace des champs dans l’entrée.",
    category: "logic",
    defaultParameters: { values: { status: "ready" } },
  },
  {
    type: "logic.condition",
    label: "Condition",
    description: "Dirige le flux vers les sorties vrai ou faux.",
    category: "logic",
    defaultParameters: { path: "status", operator: "equals", value: "ready" },
  },
] as const;

export function workflowNodeCatalogItem(type: WorkflowNodeType) {
  const item = WORKFLOW_NODE_CATALOG.find(
    (candidate) => candidate.type === type,
  );
  if (!item) throw new Error(`Unknown workflow node type: ${type}`);
  return item;
}
