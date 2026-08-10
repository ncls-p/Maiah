import { randomUUID } from "node:crypto";

import { toolConnectionRequirements } from "@/server/infrastructure/db/schema";

import type { TransferSecretPolicy } from "./resource-transfer";
import type { Executor } from "./workspace-clone.executor";

export type WorkspaceCloneInput = {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  targetOrganizationId: string;
  secretPolicy: TransferSecretPolicy;
  groupPrincipalMap?: Map<string, string>;
  preserveGroupPrincipals?: boolean;
};

export function createWorkspaceCloneContext(
  tx: Executor,
  input: WorkspaceCloneInput,
) {
  return {
    tx,
    input,
    disableSecrets: input.secretPolicy === "disable",
    suffix: `copy-${randomUUID().slice(0, 8)}`,
    providerMap: new Map<string, string>(),
    modelMap: new Map<string, string>(),
    mcpMap: new Map<string, string>(),
    mcpToolMap: new Map<string, string>(),
    connectorMap: new Map<string, string>(),
    connectionMap: new Map<string, string>(),
    skillMap: new Map<string, string>(),
    knowledgeMap: new Map<string, string>(),
    documentMap: new Map<string, string>(),
    customToolMap: new Map<string, string>(),
    agentMap: new Map<string, string>(),
    versionMap: new Map<string, string>(),
    workflowMap: new Map<string, string>(),
    scheduledTaskMap: new Map<string, string>(),
    roleMap: new Map<string, string>(),
    pendingRequirements: [] as Array<
      typeof toolConnectionRequirements.$inferSelect
    >,
  };
}

export type WorkspaceCloneContext = ReturnType<
  typeof createWorkspaceCloneContext
>;
