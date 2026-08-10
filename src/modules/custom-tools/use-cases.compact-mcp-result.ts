import { and, eq } from "drizzle-orm";

import { decryptValue } from "@/lib/crypto";
import { db } from "@/server/infrastructure/db";
import { customToolCredentialRefs } from "@/server/infrastructure/db/schema";

export function compactMcpResult(result: unknown) {
  if (typeof result !== "object" || result === null) return result;
  const record = result as Record<string, unknown>;
  if (record.structuredContent !== undefined) return record.structuredContent;
  if (record.content !== undefined) return record.content;
  return result;
}

function slugifyWorkflowPath(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `custom-tool-${Date.now()}`
  );
}

export function ensureExternallyTriggerableWorkflow(input: {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
}) {
  const externalTriggerTypes = new Set([
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.formTrigger",
    "@n8n/n8n-nodes-langchain.chatTrigger",
  ]);
  const unsupportedTriggerTypes = new Set([
    "n8n-nodes-base.executeWorkflowTrigger",
  ]);
  const path = slugifyWorkflowPath(input.name);
  const nodes = input.nodes.map((node, index) => {
    const nodeType = typeof node.type === "string" ? node.type : "";
    if (!unsupportedTriggerTypes.has(nodeType)) return node;
    return {
      ...node,
      name: typeof node.name === "string" ? node.name : "Receive input",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: Array.isArray(node.position)
        ? node.position
        : [240, 300 + index * 120],
      parameters: {
        path,
        httpMethod: "POST",
        responseMode: "lastNode",
        responseData: "firstEntryJson",
      },
    };
  });

  if (nodes.some((node) => externalTriggerTypes.has(String(node.type)))) {
    return { nodes, connections: input.connections };
  }

  const firstNode = nodes[0];
  const firstNodeName =
    typeof firstNode?.name === "string" ? firstNode.name : null;
  const webhookName = "Receive input";
  return {
    nodes: [
      {
        id: `webhook-${Date.now()}`,
        name: webhookName,
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [240, 300],
        parameters: {
          path,
          httpMethod: "POST",
          responseMode: "lastNode",
          responseData: "firstEntryJson",
        },
      },
      ...nodes,
    ],
    connections: firstNodeName
      ? {
          ...input.connections,
          [webhookName]: {
            main: [[{ node: firstNodeName, type: "main", index: 0 }]],
          },
        }
      : input.connections,
  };
}

export function extractWorkflowId(result: unknown) {
  const raw =
    Array.isArray(result) && typeof result[0]?.text === "string"
      ? result[0].text
      : result;
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;
  const workflow = record.workflow as Record<string, unknown> | undefined;
  const id = data?.id ?? workflow?.id ?? record.id;
  return typeof id === "string" ? id : null;
}

type SecretPayload = {
  credentialRef: string;
  values: Record<string, string>;
};

function findSecretValue(payloads: SecretPayload[], requestedField?: string) {
  const candidates = requestedField
    ? [requestedField]
    : ["webhookUrl", "webhookUri", "webhook_url", "webhook", "url"];
  for (const payload of payloads) {
    for (const candidate of candidates) {
      const direct = payload.values[candidate];
      if (direct) return direct;
      const insensitiveKey = findCaseInsensitiveKey(payload.values, candidate);
      if (insensitiveKey && payload.values[insensitiveKey]) {
        return payload.values[insensitiveKey];
      }
    }
  }
  return undefined;
}

function findCaseInsensitiveKey(
  values: Record<string, string>,
  candidate: string,
): string | undefined {
  const candidateLower = candidate.toLowerCase();
  for (const key of Object.keys(values)) {
    if (key.toLowerCase() === candidateLower) return key;
  }
  return undefined;
}

export function replaceSecretPlaceholders(
  value: unknown,
  payloads: SecretPayload[],
): unknown {
  if (typeof value === "string") {
    let next = value.replace(
      /__SECRET:([0-9a-f-]{36}):([A-Za-z0-9_.-]+)__/gi,
      (match, credentialRef: string, fieldName: string) => {
        const payload = payloads.find(
          (item) => item.credentialRef === credentialRef,
        );
        return payload?.values[fieldName] ?? match;
      },
    );
    next = next.replace(
      /\{\{\s*secret\.([0-9a-f-]{36})\.([A-Za-z0-9_.-]+)\s*\}\}/gi,
      (match, credentialRef: string, fieldName: string) => {
        const payload = payloads.find(
          (item) => item.credentialRef === credentialRef,
        );
        return payload?.values[fieldName] ?? match;
      },
    );
    if (next.includes("$credentials.")) {
      return findSecretValue(payloads) ?? next;
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceSecretPlaceholders(item, payloads));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        replaceSecretPlaceholders(nested, payloads),
      ]),
    );
  }
  return value;
}

export async function loadSecretPayloads(
  workspaceId: string,
  userId: string,
  refs: Array<{ credentialRef: string }> | undefined,
) {
  const payloads: SecretPayload[] = [];
  for (const ref of refs ?? []) {
    const [row] = await db
      .select()
      .from(customToolCredentialRefs)
      .where(
        and(
          eq(customToolCredentialRefs.id, ref.credentialRef),
          eq(customToolCredentialRefs.workspaceId, workspaceId),
          eq(customToolCredentialRefs.userId, userId),
        ),
      )
      .limit(1);
    if (!row) continue;
    let values: Record<string, string>;
    try {
      values = JSON.parse(await decryptValue(row.encryptedPayload));
    } catch {
      continue;
    }
    payloads.push({ credentialRef: ref.credentialRef, values });
  }
  return payloads;
}
