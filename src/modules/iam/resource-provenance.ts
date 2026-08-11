import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import {
  organizations,
  users,
  workspaces,
} from "@/server/infrastructure/db/schema";

export type ResourceProvenance = {
  scope: "user" | "workspace" | "organization";
  scopeName: string;
  ownerName: string;
};

type OwnedResource = {
  createdById: string;
  isGlobal?: boolean;
  visibility?: string | null;
};

type ProvenanceContext = {
  currentUserId: string;
  workspaceName: string;
  organizationName: string;
  ownerNames: ReadonlyMap<string, string>;
};

export function buildResourceProvenance(
  resource: OwnedResource,
  context: ProvenanceContext,
): ResourceProvenance {
  const ownerName =
    context.ownerNames.get(resource.createdById) ?? "Unknown user";
  if (resource.visibility === "workspace") {
    return {
      scope: "workspace",
      scopeName: context.workspaceName,
      ownerName,
    };
  }
  if (resource.visibility === "organization" || resource.isGlobal) {
    return {
      scope: "organization",
      scopeName: context.organizationName,
      ownerName,
    };
  }
  if (resource.createdById === context.currentUserId) {
    return { scope: "user", scopeName: ownerName, ownerName };
  }
  return {
    scope: "workspace",
    scopeName: context.workspaceName,
    ownerName,
  };
}

export async function withResourceProvenance<T extends OwnedResource>(
  resources: T[],
  workspaceId: string,
  currentUserId: string,
) {
  if (resources.length === 0) {
    return [] as Array<T & { provenance: ResourceProvenance }>;
  }

  const [workspace] = await db
    .select({
      name: workspaces.name,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const creatorIds = [
    ...new Set(resources.map(({ createdById }) => createdById)),
  ];
  const creators = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, creatorIds));
  const context: ProvenanceContext = {
    currentUserId,
    workspaceName: workspace?.name ?? "Project",
    organizationName: workspace?.organizationName ?? "Organization",
    ownerNames: new Map(creators.map(({ id, name }) => [id, name])),
  };

  return resources.map((resource) => ({
    ...resource,
    provenance: buildResourceProvenance(resource, context),
  }));
}
