import { availableActions, type McpIdentity } from "./catalog";
import { inputContract } from "./input-contract";

const synonyms: Record<string, string> = {
  list: "read",
  get: "read",
  add: "create",
  edit: "update",
  remove: "delete",
  assistant: "agents",
  assistants: "agents",
  agent: "agents",
  creer: "create",
  creation: "create",
  ajouter: "create",
  nouveau: "create",
  modifier: "update",
  configurer: "update",
  configuration: "update",
  lire: "read",
  voir: "read",
  lister: "read",
  liste: "read",
  chercher: "read",
  supprimer: "delete",
  suppression: "delete",
  projet: "workspaces",
  projets: "workspaces",
  organisation: "organizations",
  connaissances: "knowledge",
  collection: "knowledge",
  collections: "knowledge",
  document: "documents",
  fichier: "files",
  fichiers: "files",
  conversation: "conversations",
  chat: "conversations",
  dossier: "folders",
  tache: "scheduled",
  planification: "scheduled",
  planifier: "scheduled",
  outil: "tools",
  outils: "tools",
  competence: "skills",
  competences: "skills",
  fournisseur: "providers",
  fournisseurs: "providers",
  modele: "models",
  modeles: "models",
  utilisateur: "users",
  membres: "members",
  execution: "runs",
  executer: "runs",
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const methods: Record<string, string[]> = {
  create: ["POST"],
  update: ["PATCH", "PUT"],
  read: ["GET"],
  delete: ["DELETE"],
};
export function searchActions(
  identity: McpIdentity,
  query: string,
  offset = 0,
  limit = 5,
) {
  const raw = normalize(query);
  const terms = raw
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(
      (term) =>
        ![
          "un",
          "une",
          "des",
          "les",
          "de",
          "du",
          "le",
          "la",
          "a",
          "the",
          "my",
          "mes",
          "mon",
        ].includes(term),
    )
    .map((term) => synonyms[term] ?? term);
  const rows = availableActions(identity)
    .map((action) => {
      const haystack = normalize(
        `${action.operationId} ${action.path} ${action.summary}`,
      );
      const scores = terms.map((term) =>
        methods[term]
          ? methods[term].includes(action.method)
            ? 5
            : 0
          : haystack.includes(term)
            ? 3
            : 0,
      );
      const exact =
        raw &&
        (normalize(action.operationId) === raw ||
          normalize(action.path) === raw);
      return {
        action,
        score: exact ? 100 : scores.reduce<number>((a, b) => a + b, 0),
        matches:
          terms.length === 0 ||
          (scores.some((score) => score > 0) &&
            terms.every(
              (term, index) =>
                !(methods[term] || Object.values(synonyms).includes(term)) ||
                scores[index] > 0,
            )) ||
          exact,
      };
    })
    .filter((row) => row.matches)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.action.path.length - b.action.path.length ||
        a.action.operationId.localeCompare(b.action.operationId),
    );
  return {
    workspaceId: identity.workspaceId,
    total: rows.length,
    nextOffset: offset + limit < rows.length ? offset + limit : null,
    actions: rows.slice(offset, offset + limit).map(({ action }) => ({
      ...action,
      inputSchema: inputContract(action),
      usage:
        "Call maiah_run_action with operationId and input matching this schema. Project context is supplied automatically. Route validation and permissions remain authoritative.",
      ...(action.operationId === "postWorkspaceAgents"
        ? {
            hint: "Creates the assistant AND active version, model and bindings in one operation. Provide systemPrompt, providerId, modelId and toolBindings together. Defaults to personal visibility; do not create an empty assistant then configure it through multiple updates.",
          }
        : {}),
      ...(action.operationId === "patchWorkspaceAgentsAgentId"
        ? {
            hint: "Read the assistant first and pass its activeVersionId as baseVersionId. Do not overwrite a version conflict.",
          }
        : {}),
    })),
  };
}
