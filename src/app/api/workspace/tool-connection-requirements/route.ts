import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
	handleRoute,
	requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { upsertToolConnectionRequirement } from "@/modules/tool-connections/use-cases";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const upsertSchema = z.object({
	workspaceId: z.uuid(),
	connectorId: z.uuid(),
	toolSource: z.string().min(1).max(16),
	toolId: z.string().min(1).max(255),
	required: z.boolean().optional(),
	configSchema: jsonRecordSchema.nullable().optional(),
});

export async function PUT(req: NextRequest) {
	return handleRoute(
		req,
		async ({ session }) => {
			const parsed = upsertSchema.safeParse(await req.json());
			if (!parsed.success) {
				return NextResponse.json(
					{ error: "Invalid input", details: parsed.error.issues },
					{ status: 400 },
				);
			}

			const forbidden = await requireWorkspacePermissionAsync(
				session.user.id,
				parsed.data.workspaceId,
				"mcpServers.manage",
			);
			if (forbidden) return forbidden;

			return NextResponse.json(
				await upsertToolConnectionRequirement(parsed.data),
			);
		},
		{ logLabel: "Failed to upsert tool connection requirement" },
	);
}
