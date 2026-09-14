import { z } from "zod";

const ids = z
  .string()
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(z.array(z.uuid()).max(50))
  .optional();
export const analyticsQuerySchema = z
  .object({
    scope: z.enum(["application", "organization", "workspace"]),
    scopeId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    organizationIds: ids,
    workspaceIds: ids,
    userIds: ids,
    teamIds: ids,
    providerIds: ids,
    modelIds: ids,
    agentIds: ids,
    operation: z.string().trim().max(64).optional(),
    status: z.string().trim().max(16).optional(),
    action: z.string().trim().max(128).optional(),
    outcome: z.enum(["success", "failed", "denied"]).optional(),
    resourceType: z.string().trim().max(64).optional(),
    resourceId: z.uuid().optional(),
    conversationId: z.uuid().optional(),
    groupBy: z
      .enum([
        "provider",
        "model",
        "organization",
        "workspace",
        "user",
        "agent",
        "operation",
      ])
      .default("provider"),
    bucket: z.enum(["day", "week", "month"]).default("day"),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, ctx) => {
    if (value.scope !== "application" && !value.scopeId)
      ctx.addIssue({
        code: "custom",
        path: ["scopeId"],
        message: "A scope ID is required",
      });
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to))
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "End must follow start",
      });
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsKind = "usage" | "audit";
export type AnalyticsScope = {
  id: string;
  name: string;
  type: AnalyticsQuery["scope"];
  organizationId?: string;
  canExport: boolean;
};
