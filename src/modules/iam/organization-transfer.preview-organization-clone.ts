import { createHash, randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  aiProviders,
  agentSkills,
  conversations,
  customTools,
  knowledgeBases,
  mcpServers,
  organizationBuiltinToolPolicies,
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  scheduledTasks,
  teamMembers,
  teams,
  toolConnections,
  workflows,
  workspaceMembers,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";

import { IamOperationError } from "./use-cases";
import { cloneWorkspaceConfiguration } from "./workspace-clone";
import { previewOrganizationTransfer } from "./organization-transfer.preview-organization-transfer";


export async function previewOrganizationClone(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetOrganizationId: string;
  secretPolicy: "keep" | "disable";
}) {
  const transferPreview = await previewOrganizationTransfer(input);
  const preview = {
    ...transferPreview,
    conflictResolutions: [],
    blockers: [] as string[],
    warnings: [
      "Each source project will be created as a new project in the destination organization.",
      "Teams, members, custom roles, permissions, and organization tool policies will be copied. The source organization stays unchanged.",
      "Chats, execution history, audit logs, API keys, and pending requests stay in the source organization.",
      input.secretPolicy === "keep"
        ? "Encrypted provider, MCP, and connection secrets will be copied."
        : "Cloned providers, MCP servers, tools, and connections will be disabled until their secrets are configured.",
      "Project and team URLs receive a short suffix so cloning never overwrites existing content.",
    ],
  };
  return {
    ...preview,
    confirmationToken: createHash("sha256")
      .update(
        JSON.stringify({
          mode: "clone",
          sourceOrganizationId: preview.source.organizationId,
          targetOrganizationId: preview.destination.organizationId,
          counts: preview.counts,
          secretPolicy: input.secretPolicy,
        }),
      )
      .digest("hex"),
  };
}
