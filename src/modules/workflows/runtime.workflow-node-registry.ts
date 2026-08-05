


import {
isWorkflowSecretReference
} from "./agentic-history";
import {
type WorkflowDefinition,
type WorkflowNode
} from "./contracts";
import {
calculateNumber,
condition,
currentDate,
delayFlow,
filterList,
sliceList,
sortList,
stopFlow,
} from "./runtime.calculate-number";
import {
debugSnapshot,
executeCode,
httpRequest,
runAgent,
} from "./runtime.http-request";
import {
manualTrigger,
parseJson,
pickData,
removeData,
renameData,
setData,
stringifyJson,
templateData,
transformText,
} from "./runtime.matches-comparison";
import { objectValue } from "./runtime.workflow-runtime-dependencies";

export const WORKFLOW_NODE_REGISTRY = {
  "trigger.manual": manualTrigger,
  "data.set": setData,
  "data.pick": pickData,
  "data.remove": removeData,
  "data.rename": renameData,
  "data.template": templateData,
  "data.parseJson": parseJson,
  "data.stringifyJson": stringifyJson,
  "text.transform": transformText,
  "number.calculate": calculateNumber,
  "list.filter": filterList,
  "list.sort": sortList,
  "list.slice": sliceList,
  "logic.condition": condition,
  "logic.delay": delayFlow,
  "logic.stop": stopFlow,
  "debug.snapshot": debugSnapshot,
  "date.now": currentDate,
  "http.request": httpRequest,
  "code.execute": executeCode,
  "agent.run": runAgent,
} as const;

export function hasCycle(definition: WorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  for (const node of definition.nodes) outgoing.set(node.id, []);
  for (const edge of definition.edges)
    outgoing.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return definition.nodes.some((node) => visit(node.id));
}

export function assertNodeParameters(node: WorkflowNode) {
  const params = node.parameters;
  if (node.type === "agent.run") {
    if (
      typeof params.agentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        params.agentId,
      )
    ) {
      throw new Error(`Node '${node.label}' requires a valid agent.`);
    }
    if (typeof params.prompt !== "string" || !params.prompt.trim()) {
      throw new Error(`Node '${node.label}' requires an instruction.`);
    }
  }
  if (node.type === "http.request") {
    if (!isWorkflowSecretReference(params.url)) {
      let url: URL;
      try {
        url = new URL(String(params.url ?? ""));
      } catch {
        throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
      }
      if (url.protocol !== "https:" || url.toString().length > 2_048) {
        throw new Error(`Node '${node.label}' requires a valid HTTPS URL.`);
      }
    }
    if (
      params.headers !== undefined &&
      Object.keys(objectValue(params.headers)).length > 50
    ) {
      throw new Error(`Node '${node.label}' has too many HTTP headers.`);
    }
  }
  if (node.type === "code.execute") {
    if (params.language !== "node" && params.language !== "python") {
      throw new Error(`Node '${node.label}' has an invalid code language.`);
    }
    if (
      typeof params.code !== "string" ||
      !params.code.trim() ||
      params.code.length > 100_000
    ) {
      throw new Error(
        `Node '${node.label}' requires code under 100,000 characters.`,
      );
    }
  }
  if (
    node.type === "data.set" &&
    Object.keys(objectValue(params.values)).length > 200
  ) {
    throw new Error(`Node '${node.label}' defines too many fields.`);
  }
  if (
    (node.type === "data.pick" || node.type === "data.remove") &&
    (!Array.isArray(params.paths) ||
      params.paths.length === 0 ||
      params.paths.length > 200 ||
      params.paths.some((path) => typeof path !== "string" || !path.trim()))
  ) {
    throw new Error(`Node '${node.label}' requires one or more field paths.`);
  }
  if (
    node.type === "data.rename" &&
    (typeof params.from !== "string" ||
      !params.from.trim() ||
      typeof params.to !== "string" ||
      !params.to.trim())
  ) {
    throw new Error(`Node '${node.label}' requires source and target paths.`);
  }
  if (
    (node.type === "data.template" ||
      node.type === "data.parseJson" ||
      node.type === "data.stringifyJson" ||
      node.type === "text.transform" ||
      node.type === "number.calculate" ||
      node.type === "list.filter" ||
      node.type === "list.sort" ||
      node.type === "list.slice" ||
      node.type === "date.now") &&
    (typeof params.outputPath !== "string" || !params.outputPath.trim())
  ) {
    throw new Error(`Node '${node.label}' requires an output path.`);
  }
  if (
    node.type === "logic.delay" &&
    (!Number.isFinite(Number(params.delayMs)) ||
      Number(params.delayMs) < 0 ||
      Number(params.delayMs) > 60_000)
  ) {
    throw new Error(`Node '${node.label}' requires a delay under 60 seconds.`);
  }
  if (
    node.type === "logic.condition" &&
    (typeof params.path !== "string" || !params.path.trim())
  ) {
    throw new Error(`Node '${node.label}' requires a field path.`);
  }
}
