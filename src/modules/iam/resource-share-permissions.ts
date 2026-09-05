import {
  resourceDefinition,
  type AccessResourceType,
} from "@/server/domain/entities/access-resource";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";
import { withFreshAuthorization } from "@/server/domain/services/authorization.fresh-context";
import { expandPermissionGrants } from "./permission-matching";
import { requireDelegablePermissions } from "./use-cases.iam-operation-error";

/** Publishing visibility must not manufacture usage rights the publisher lacks. */
export async function requireResourceSharePermissions(input: {
  actorUserId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  workspaceId?: string;
}) {
  const name =
    input.resourceType === "agent"
      ? "workspace.agent_user"
      : "workspace.viewer";
  const role = SYSTEM_ROLES.find((entry) => entry.name === name)!;
  const domains = resourceDefinition(input.resourceType)!.permissionDomains;
  const permissions = expandPermissionGrants(role.permissions).filter(
    (permission) => domains.includes(permission.split(".")[0]),
  );
  await withFreshAuthorization(() =>
    requireDelegablePermissions({
      ...input,
      resourceType: input.workspaceId ? "workspace" : input.resourceType,
      resourceId: input.workspaceId ?? input.resourceId,
      permissions,
    }),
  );
}
