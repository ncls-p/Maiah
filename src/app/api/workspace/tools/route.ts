import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { listBuiltInTools } from "@/modules/tool/builtin-tools";
import {
  listOrganizationBuiltInToolPolicies,
  updateOrganizationBuiltInToolPolicy,
} from "@/modules/tool/organization-builtin-tool-policies";
import { audit } from "@/server/domain/services/audit";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z
  .object({
    workspaceId: z.uuid(),
    toolName: z.string().trim().min(1).max(255),
    enabled: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined || value.requireApproval !== undefined,
    { message: "At least one policy field is required" },
  );

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.view",
      );
      if (forbidden) return forbidden;

      const policies = await listOrganizationBuiltInToolPolicies(
        parsed.data.workspaceId,
      );
      const policiesByName = new Map(
        policies.map((policy) => [policy.name, policy]),
      );

      return NextResponse.json(
        listBuiltInTools().map((tool) => ({
          ...tool,
          enabled: policiesByName.get(tool.name)?.enabled ?? true,
          requireApproval:
            policiesByName.get(tool.name)?.requireApproval ??
            tool.requiresApprovalByDefault,
          configured: policiesByName.get(tool.name)?.configured ?? false,
        })),
      );
    },
    { logLabel: "Failed to list tools" },
  );
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session, request }) => {
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.issues },
          { status: 400 },
        );
      }

      if (!(await canManageTenantGlobals(session, parsed.data.workspaceId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const policy = await updateOrganizationBuiltInToolPolicy({
        ...parsed.data,
        updatedById: session.user.id,
      });
      if (!policy) {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }

      await audit.emit({
        workspaceId: parsed.data.workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "builtin_tool.policy.update",
        resourceType: "builtin_tool",
        resourceId: policy.id,
        outcome: "success",
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        userAgent: request.headers.get("user-agent") ?? undefined,
        metadata: {
          toolName: policy.name,
          enabled: policy.enabled,
          requireApproval: policy.requireApproval,
        },
      });

      return NextResponse.json(policy);
    },
    { logLabel: "Failed to update built-in tool policy" },
  );
}
