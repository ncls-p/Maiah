import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  workflowAgentInputRequests,
  workflowAgentMessages,
} from "@/server/infrastructure/db/schema";
import {
  SECRET_REFERENCE_PATTERN,
  parsedFields,
} from "./agentic-history.secret-reference-pattern";

export async function resolveWorkflowSecretReferences(
  value: unknown,
  input: { workflowId: string; workspaceId: string },
): Promise<unknown> {
  const serialized = JSON.stringify(value) ?? "";
  const references = Array.from(
    serialized.matchAll(SECRET_REFERENCE_PATTERN),
  ).map((match) => ({ requestId: match[1], fieldName: match[2] }));
  const requestIds = Array.from(
    new Set(references.map((reference) => reference.requestId)),
  );
  if (requestIds.length === 0) return value;
  if (requestIds.length > 20) {
    throw new Error("Too many secure workflow references.");
  }

  const rows = await db
    .select()
    .from(workflowAgentInputRequests)
    .where(
      and(
        inArray(workflowAgentInputRequests.id, requestIds),
        eq(workflowAgentInputRequests.workflowId, input.workflowId),
        eq(workflowAgentInputRequests.workspaceId, input.workspaceId),
        eq(workflowAgentInputRequests.status, "consumed"),
      ),
    );
  const valuesByRequest = new Map<string, Record<string, string>>();
  const fieldsByRequest = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.valuesEncrypted) continue;
    const fields = parsedFields(row.fieldsJson);
    fieldsByRequest.set(
      row.id,
      new Set(
        fields.filter((field) => field.sensitive).map((field) => field.name),
      ),
    );
    valuesByRequest.set(
      row.id,
      z
        .record(z.string(), z.string())
        .parse(JSON.parse(await decryptValue(row.valuesEncrypted))),
    );
  }

  const replace = (current: unknown): unknown => {
    if (typeof current === "string") {
      return current.replace(
        SECRET_REFERENCE_PATTERN,
        (placeholder, requestId: string, fieldName: string) => {
          const allowedFields = fieldsByRequest.get(requestId);
          const resolved = valuesByRequest.get(requestId)?.[fieldName];
          if (!allowedFields?.has(fieldName) || resolved === undefined) {
            throw new Error(
              `Secure workflow reference is unavailable: ${placeholder}`,
            );
          }
          return resolved;
        },
      );
    }
    if (Array.isArray(current)) return current.map(replace);
    if (typeof current === "object" && current !== null) {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [key, replace(item)]),
      );
    }
    return current;
  };

  return replace(value);
}
