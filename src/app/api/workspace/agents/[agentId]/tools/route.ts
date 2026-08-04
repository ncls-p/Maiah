import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import {
  AgentVersionConflictError,
  getVisibleAgentById,
  getActiveVersion,
  getAgentVersionById,
  updateAgent,
} from "@/modules/agent/use-cases";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  getToolBindingsForVersion,
  toolBindingInputSchema,
} from "@/modules/tool/use-cases";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import { audit } from "@/server/domain/services/audit";
import { getBoundSkillCatalog } from "@/modules/skills/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  customTools,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const querySchema = z.object({
  workspaceId: z.uuid(),
  versionId: z.uuid().optional(),
  includeDetails: z.literal("true").optional(),
});

type ToolBinding = Awaited<
  ReturnType<typeof getToolBindingsForVersion>
>[number];

type ToolSummary = {
  id: string;
  source: "builtin" | "mcp" | "custom";
  name: string;
  description: string | null;
  group: string | null;
  requireApproval: boolean;
};

async function describeToolBindings(
  bindings: ToolBinding[],
  workspaceId: string,
) {
  const customToolIds = bindings
    .filter((binding) => binding.toolSource === "custom")
    .map((binding) => binding.toolId);
  const mcpToolIds = bindings
    .filter((binding) => binding.toolSource === "mcp")
    .map((binding) => binding.toolId);

  const [customToolRows, mcpToolRows] = await Promise.all([
    customToolIds.length > 0
      ? db
          .select({
            id: customTools.id,
            name: customTools.name,
            description: customTools.description,
          })
          .from(customTools)
          .where(
            and(
              inArray(customTools.id, customToolIds),
              eq(customTools.workspaceId, workspaceId),
            ),
          )
      : Promise.resolve([]),
    mcpToolIds.length > 0
      ? db
          .select({
            id: mcpTools.id,
            name: mcpTools.name,
            description: mcpTools.description,
            group: mcpServers.name,
          })
          .from(mcpTools)
          .innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id))
          .where(
            and(
              inArray(mcpTools.id, mcpToolIds),
              eq(mcpServers.workspaceId, workspaceId),
            ),
          )
      : Promise.resolve([]),
  ]);

  const customToolsById = new Map(
    customToolRows.map((tool) => [tool.id, tool]),
  );
  const mcpToolsById = new Map(mcpToolRows.map((tool) => [tool.id, tool]));

  return bindings.flatMap<ToolSummary>((binding) => {
    if (binding.toolSource === "builtin") {
      const tool = getBuiltInTool(binding.toolId);
      return tool
        ? [
            {
              id: binding.toolId,
              source: "builtin" as const,
              name: tool.displayName,
              description: tool.description,
              group: tool.category,
              requireApproval: binding.requireApproval,
            },
          ]
        : [];
    }

    if (binding.toolSource === "mcp") {
      const tool = mcpToolsById.get(binding.toolId);
      return tool
        ? [
            {
              id: binding.toolId,
              source: "mcp" as const,
              name: tool.name,
              description: tool.description,
              group: tool.group,
              requireApproval: binding.requireApproval,
            },
          ]
        : [];
    }

    if (binding.toolSource === "custom") {
      const tool = customToolsById.get(binding.toolId);
      return tool
        ? [
            {
              id: binding.toolId,
              source: "custom" as const,
              name: tool.name,
              description: tool.description,
              group: null,
              requireApproval: binding.requireApproval,
            },
          ]
        : [];
    }

    return [];
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        versionId: searchParams.get("versionId") ?? undefined,
        includeDetails: searchParams.get("includeDetails") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId, versionId, includeDetails } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.get",
        "agent",
        (await params).agentId,
      );
      if (forbidden) return forbidden;
      const agent = await getVisibleAgentById(
        agentId,
        workspaceId,
        session.user.id,
        await canManageTenantGlobals(session, workspaceId),
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const targetVersion = versionId
        ? await getAgentVersionById(versionId)
        : await getActiveVersion(agentId);
      if (targetVersion && targetVersion.agentId !== agentId) {
        return NextResponse.json(
          { error: "Version not found" },
          { status: 404 },
        );
      }
      const targetVersionId = targetVersion?.id;
      if (!targetVersionId) {
        return NextResponse.json(
          includeDetails === "true"
            ? { bindings: [], tools: [], skills: [] }
            : [],
        );
      }
      const bindings = await getToolBindingsForVersion(targetVersionId, {
        workspaceId,
        userId: session.user.id,
      });
      if (includeDetails === "true") {
        const [tools, skills] = await Promise.all([
          describeToolBindings(bindings, workspaceId),
          getBoundSkillCatalog(targetVersionId),
        ]);
        return NextResponse.json({
          bindings,
          tools,
          skills,
        });
      }
      return NextResponse.json(bindings);
    },
    { logLabel: "Failed to list agent tools" },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        versionId: searchParams.get("versionId") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.update",
        "agent",
        (await params).agentId,
      );
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(session, workspaceId);
      const agent = await getVisibleAgentById(
        agentId,
        workspaceId,
        session.user.id,
        canAdminCurate,
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      if (!agent.activeVersionId) {
        return NextResponse.json(
          { error: "No active version to bind tools to" },
          { status: 400 },
        );
      }
      const body = await req.json();
      const parsedBody = z
        .object({
          baseVersionId: z.uuid().nullable(),
          bindings: z.array(toolBindingInputSchema),
        })
        .safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: "Invalid request body", details: parsedBody.error.issues },
          { status: 400 },
        );
      }
      const { version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        baseVersionId: parsedBody.data.baseVersionId,
        canAdminCurate,
        toolBindings: parsedBody.data.bindings,
      });
      await audit.emit({
        workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "agent.tools.updated",
        resourceType: "agent",
        resourceId: agentId,
        outcome: "success",
        metadata: {
          versionId: version.id,
          versionNumber: version.versionNumber,
          bindingCount: parsedBody.data.bindings.length,
        },
      });
      const bindings = await getToolBindingsForVersion(version.id);
      return NextResponse.json({ version, bindings });
    },
    {
      logLabel: "Failed to update agent tools",
      expectedError: (error) => {
        if (error instanceof AgentVersionConflictError) {
          return NextResponse.json(
            {
              error: error.message,
              code: error.code,
              currentVersionId: error.currentVersionId,
            },
            { status: 409 },
          );
        }
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        if (
          error instanceof Error &&
          [
            "Tool not found",
            "Custom tool not found",
            "MCP tool not found",
          ].includes(error.message)
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (
          error instanceof Error &&
          error.message === "Only the creator or an admin can update this agent"
        ) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
