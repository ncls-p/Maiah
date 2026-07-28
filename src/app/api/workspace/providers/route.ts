import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireWorkspaceMemberAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  createProviderWithModels,
  listProviders,
  listModels,
  toSafeProvider,
} from "@/modules/provider/use-cases";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import {
  DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  OPENAI_COMPATIBLE_API_ROUTES,
} from "@/lib/openai-compatible-api";

const providerKindSchema = z.enum([
  "openai-compatible",
  "dragonfly",
  "vercel-ai-gateway",
  "native",
]);

const providerAuthTypeSchema = z.enum([
  "bearer",
  "x-api-key",
  "custom-header",
  "gateway",
]);

const createProviderSchema = z.object({
  kind: providerKindSchema,
  name: z.string().min(1).max(255),
  baseUrl: z.url().optional().or(z.literal("")),
  authType: providerAuthTypeSchema,
  apiKey: z.string().min(1).optional().or(z.literal("")),
  headersJson: z.record(z.string(), z.string()).optional(),
  queryParamsJson: z.record(z.string(), z.string()).optional(),
  openaiCompatibleApiRoute: z
    .enum(OPENAI_COMPATIBLE_API_ROUTES)
    .default(DEFAULT_OPENAI_COMPATIBLE_API_ROUTE),
  workspaceId: z.uuid(),
});

const listProvidersSchema = z.object({
  workspaceId: z.uuid(),
});

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const parsed = listProvidersSchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        parsed.data.workspaceId,
        "providers.viewMetadata",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const providers = await listProviders(parsed.data.workspaceId);
      const visibleProviders = await Promise.all(
        providers.map(async (provider) => {
          const canViewProvider = await hasResourcePermissionForRequest(
            session.user.id,
            parsed.data.workspaceId,
            "providers.viewMetadata",
            "provider",
            provider.id,
          );
          if (canViewProvider) return toSafeProvider(provider);
          const models = await listModels(provider.id);
          const modelVisibility = await Promise.all(
            models.map((model) =>
              hasResourcePermissionForRequest(
                session.user.id,
                parsed.data.workspaceId,
                "models.view",
                "model",
                model.id,
              ),
            ),
          );
          return modelVisibility.some(Boolean)
            ? toSafeProvider(provider)
            : null;
        }),
      );
      return NextResponse.json(
        visibleProviders.filter((provider) => provider !== null),
      );
    },
    { logLabel: "Failed to list providers" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createProviderSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { workspaceId, ...input } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "providers.create",
      );
      if (forbidden) return forbidden;
      const { provider, modelRefresh } = await createProviderWithModels({
        workspaceId,
        userId: session.user.id,
        ...input,
      });
      return NextResponse.json(
        { ...toSafeProvider(provider), modelRefresh },
        { status: 201 },
      );
    },
    { logLabel: "Failed to create provider" },
  );
}
