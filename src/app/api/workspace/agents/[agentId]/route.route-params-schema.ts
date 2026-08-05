import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import {
  archiveAgent,
  AgentVersionConflictError,
  canEditAgent,
  getVisibleAgentById,
  normalizePromptSuggestions,
  updateAgent,
} from "@/modules/agent/use-cases";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { toolBindingInputSchema } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import {
  delegationBindingInputSchema,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import { DelegationBindingValidationError } from "@/modules/agent/delegation-use-cases";

export const routeParamsSchema = z.object({ agentId: z.uuid() });
export const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-]+$/);
const agentLogoUrlSchema = z
  .string()
  .max(350_000)
  .regex(
    /^data:image\/(?!svg\+xml)[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/,
  )
  .nullable();

const promptSuggestionsSchema = z
  .array(z.string().trim().min(1).max(240))
  .max(12);

export const updateAgentSchema = z.object({
  workspaceId: z.uuid(),
  baseVersionId: z.uuid().nullable(),
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(2048).optional().or(z.literal("")),
  logoUrl: agentLogoUrlSchema.optional(),
  systemPrompt: z.string().max(64_000).optional().or(z.literal("")),
  promptSuggestions: promptSuggestionsSchema.optional(),
  providerId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  temperature: z.string().optional(),
  topP: z.string().optional(),
  maxOutputTokens: z
    .number()
    .int()
    .positive()
    .max(agentRuntimePolicy.maxOutputTokens)
    .optional(),
  maxToolCalls: z
    .number()
    .int()
    .min(0)
    .max(agentRuntimePolicy.maxToolCalls)
    .optional(),
  sharingMode: z.enum(["personal", "marketplace", "specific_user"]).optional(),
  shareTargetEmail: z.email().optional().or(z.literal("")),
  isGlobal: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  curationLabel: z
    .enum(["none", "recommended", "organization_created"])
    .optional(),
  toolBindings: z.array(toolBindingInputSchema).optional(),
  knowledgeBindings: z.array(z.uuid()).optional(),
  skillBindings: z.array(z.uuid()).optional(),
  orchestrationPolicy: orchestrationPolicySchema.optional(),
  delegationBindings: z.array(delegationBindingInputSchema).optional(),
  toolChoice: z.enum(["auto", "required", "none"]).optional(),
  generationSettings: z
    .object({
      topK: z.number().int().positive().optional(),
      presencePenalty: z.number().min(-1).max(1).optional(),
      frequencyPenalty: z.number().min(-1).max(1).optional(),
      seed: z.number().int().optional(),
      maxRetries: z.number().int().min(0).optional(),
      stopSequences: z.array(z.string()).optional(),
    })
    .optional(),
  responseFormat: z.enum(["text", "json_object"]).optional(),
  memoryPolicy: z
    .object({
      enabled: z.boolean().optional(),
      maxMessages: z.number().int().positive().optional(),
    })
    .optional(),
  guardrails: z
    .object({
      enabled: z.boolean().optional(),
      blockedTopics: z.array(z.string()).optional(),
    })
    .optional(),
  approvalPolicy: z
    .object({
      requireApprovalForAllTools: z.boolean().optional(),
      defaultDecision: z.enum(["allow", "deny", "require_approval"]).optional(),
      requireApprovalRiskLevels: z
        .array(z.enum(["low", "medium", "high", "critical"]))
        .optional(),
      requireApprovalToolNames: z.array(z.string().min(1)).optional(),
      denyToolNames: z.array(z.string().min(1)).optional(),
      requireApprovalSources: z
        .enum(["builtin", "custom", "mcp"])
        .array()
        .optional(),
    })
    .optional(),
});

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
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
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.get",
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
      let shareTargetEmail: string | null = null;
      if (agent.shareTargetUserId) {
        const [target] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, agent.shareTargetUserId))
          .limit(1);
        shareTargetEmail = target?.email ?? null;
      }
      const [canCreateAgent, canUpdateAgents] = await Promise.all([
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "agents.create",
        ),
        hasWorkspacePermissionForRequest(
          session.user.id,
          workspaceId,
          "agents.update",
        ),
      ]);
      const canDirectlyUpdate = await authorization.hasDirectPermission(
        { principalType: "user", principalId: session.user.id },
        "agents.update",
        "agent",
        agent.id,
        workspaceId,
      );
      const [agentWithProvenance] = await withResourceProvenance(
        [agent],
        workspaceId,
        session.user.id,
      );
      return NextResponse.json({
        ...agentWithProvenance,
        promptSuggestions: normalizePromptSuggestions(
          agent.promptSuggestionsJson,
        ),
        canAdminCurate,
        canEdit:
          (canUpdateAgents &&
            canEditAgent(agent, session.user.id, canAdminCurate)) ||
          canDirectlyUpdate,
        canClone: canCreateAgent,
        shareTargetEmail,
      });
    },
    { logLabel: "Failed to get agent" },
  );
}
