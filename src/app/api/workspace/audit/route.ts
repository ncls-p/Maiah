import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { auditEvents } from "@/server/infrastructure/db/schema";

const querySchema = z.object({
	workspaceId: z.uuid(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const { searchParams } = new URL(req.url);
		const parsed = querySchema.safeParse({
			workspaceId: searchParams.get("workspaceId"),
			limit: searchParams.get("limit") ?? undefined,
		});
		if (!parsed.success)
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"audit.view",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted)
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		const events = await db
			.select()
			.from(auditEvents)
			.where(and(eq(auditEvents.workspaceId, parsed.data.workspaceId)))
			.orderBy(desc(auditEvents.createdAt))
			.limit(parsed.data.limit);
		return NextResponse.json(events);
	} catch (error) {
		logger.error("Failed to list audit events", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
