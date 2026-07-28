import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import {
  addOrganizationMember,
  addTeamMember,
  assignRole,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
  deleteCustomRole,
  deleteTeam,
  getAccessConsoleSnapshot,
  IamOperationError,
  removeOrganizationMember,
  removeRoleAssignment,
  removeTeamMember,
  updateCustomRole,
} from "@/modules/iam/use-cases";

const workspaceQuerySchema = z.object({
  workspaceId: z.uuid(),
});

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createOrganization"),
    organizationName: z.string().trim().min(2).max(255),
    organizationSlug: z.string().trim().max(128).optional(),
    projectName: z.string().trim().min(2).max(255),
    projectSlug: z.string().trim().max(128).optional(),
  }),
  z.object({
    action: z.literal("createProject"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    slug: z.string().trim().max(128).optional(),
  }),
  z.object({
    action: z.literal("addMember"),
    workspaceId: z.uuid(),
    email: z.email(),
  }),
  z.object({
    action: z.literal("removeMember"),
    workspaceId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("createTeam"),
    workspaceId: z.uuid(),
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("addTeamMember"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("removeTeamMember"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
    userId: z.uuid(),
  }),
  z.object({
    action: z.literal("deleteTeam"),
    workspaceId: z.uuid(),
    teamId: z.uuid(),
  }),
  z.object({
    action: z.literal("createRole"),
    workspaceId: z.uuid(),
    displayName: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
    scopeType: z.enum(["organization", "workspace"]),
    permissions: z.array(z.string().trim().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("assignRole"),
    workspaceId: z.uuid(),
    principalType: z.enum(["user", "group"]),
    principalId: z.uuid(),
    roleId: z.uuid(),
    scopeType: z.enum(["organization", "workspace"]),
  }),
  z.object({
    action: z.literal("assignRoleBulk"),
    workspaceId: z.uuid(),
    principalIds: z.array(z.uuid()).min(1).max(100),
    roleId: z.uuid(),
    scopeType: z.enum(["organization", "workspace"]),
  }),
  z.object({
    action: z.literal("removeAssignment"),
    workspaceId: z.uuid(),
    bindingId: z.uuid(),
  }),
  z.object({
    action: z.literal("deleteRole"),
    workspaceId: z.uuid(),
    roleId: z.uuid(),
  }),
  z.object({
    action: z.literal("updateRole"),
    workspaceId: z.uuid(),
    roleId: z.uuid(),
    displayName: z.string().trim().min(2).max(255),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(z.string().trim().min(1)).min(1).max(100),
  }),
]);

function expectedIamError(error: unknown) {
  if (error instanceof IamOperationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = workspaceQuerySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid project", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const snapshot = await getAccessConsoleSnapshot({
        userId: session.user.id,
        workspaceId: parsed.data.workspaceId,
      });
      return NextResponse.json(snapshot);
    },
    {
      allowApiKey: false,
      logLabel: "Failed to load access console",
      expectedError: expectedIamError,
    },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = mutationSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const input = parsed.data;
      switch (input.action) {
        case "createOrganization": {
          const project = await createOrganizationWithProject({
            userId: session.user.id,
            organizationName: input.organizationName,
            organizationSlug: input.organizationSlug,
            projectName: input.projectName,
            projectSlug: input.projectSlug,
          });
          return NextResponse.json({ project }, { status: 201 });
        }
        case "createProject": {
          const project = await createProject({
            userId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            slug: input.slug,
          });
          return NextResponse.json({ project }, { status: 201 });
        }
        case "addMember":
          await addOrganizationMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            email: input.email,
          });
          break;
        case "removeMember":
          await removeOrganizationMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            userId: input.userId,
          });
          break;
        case "createTeam":
          await createTeam({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            name: input.name,
            description: input.description,
          });
          break;
        case "addTeamMember":
          await addTeamMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            userId: input.userId,
          });
          break;
        case "removeTeamMember":
          await removeTeamMember({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
            userId: input.userId,
          });
          break;
        case "deleteTeam":
          await deleteTeam({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            teamId: input.teamId,
          });
          break;
        case "createRole":
          await createCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            displayName: input.displayName,
            description: input.description,
            scopeType: input.scopeType,
            permissions: input.permissions,
          });
          break;
        case "assignRole":
          await assignRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            principalType: input.principalType,
            principalId: input.principalId,
            roleId: input.roleId,
            scopeType: input.scopeType,
          });
          break;
        case "assignRoleBulk":
          for (const principalId of [...new Set(input.principalIds)]) {
            await assignRole({
              actorUserId: session.user.id,
              workspaceId: input.workspaceId,
              principalType: "user",
              principalId,
              roleId: input.roleId,
              scopeType: input.scopeType,
            });
          }
          break;
        case "removeAssignment":
          await removeRoleAssignment({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            bindingId: input.bindingId,
          });
          break;
        case "deleteRole":
          await deleteCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            roleId: input.roleId,
          });
          break;
        case "updateRole":
          await updateCustomRole({
            actorUserId: session.user.id,
            workspaceId: input.workspaceId,
            roleId: input.roleId,
            displayName: input.displayName,
            description: input.description,
            permissions: input.permissions,
          });
          break;
      }

      return NextResponse.json({ ok: true });
    },
    {
      allowApiKey: false,
      logLabel: "Failed to update access",
      expectedError: expectedIamError,
    },
  );
}
