import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
	handleRoute,
	requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { upsertUserToolSettings } from "@/modules/tool-connections/use-cases";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const secretRecordSchema = z.record(z.string(), z.string());
const upsertSchema = z.object({
	workspaceId: z.uuid(),
	toolSource: z.string().min(1).max(16),
	toolId: z.string().min(1).max(255),
	connectionId: z.uuid().nullable().optional(),
	config: jsonRecordSchema.nullable().optional(),
	secrets: secretRecordSchema.nullable().optional(),
	enabled: z.boolean().optional(),
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
				"tools.configure",
			);
			if (forbidden) return forbidden;

			return NextResponse.json(
				await upsertUserToolSettings({
					...parsed.data,
					userId: session.user.id,
				}),
			);
		},
		{ logLabel: "Failed to upsert user tool settings" },
	);
}
