
import { count,inArray } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
agents,
agentSkills,
aiProviders,
conversations,
customTools,
knowledgeBases,
mcpServers,
scheduledTasks,
toolConnections,
workflows
} from "@/server/infrastructure/db/schema";

import { withNumericSuffix } from "./organization-transfer.organization-transfer-destination";


export function planConflictResolutions(input: {
  resourceType: "project" | "team" | "role";
  maxLength: number;
  source: Array<{ id: string; value: string; label: string }>;
  targetValues: string[];
}) {
  const targetValues = new Set(input.targetValues);
  const usedValues = new Set([
    ...input.targetValues,
    ...input.source
      .filter(({ value }) => !targetValues.has(value))
      .map(({ value }) => value),
  ]);

  return [...input.source]
    .filter(({ value }) => targetValues.has(value))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((resource) => {
      let suffix = 2;
      let nextValue = withNumericSuffix(
        resource.value,
        suffix,
        input.maxLength,
      );
      while (usedValues.has(nextValue)) {
        suffix += 1;
        nextValue = withNumericSuffix(resource.value, suffix, input.maxLength);
      }
      usedValues.add(nextValue);
      return {
        resourceType: input.resourceType,
        resourceId: resource.id,
        label: resource.label,
        from: resource.value,
        to: nextValue,
      };
    });
}

export async function resourceCount(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return 0;
  const tables = [
    agents,
    aiProviders,
    mcpServers,
    toolConnections,
    customTools,
    knowledgeBases,
    agentSkills,
    workflows,
    scheduledTasks,
    conversations,
  ] as const;
  const counts = await Promise.all(
    tables.map((table) =>
      db
        .select({ value: count() })
        .from(table)
        .where(inArray(table.workspaceId, workspaceIds))
        .then((rows) => Number(rows[0]?.value ?? 0)),
    ),
  );
  return counts.reduce((total, value) => total + value, 0);
}
