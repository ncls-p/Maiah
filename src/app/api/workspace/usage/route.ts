import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { usageEvents } from "@/server/infrastructure/db/schema";

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
			"usage.view",
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
			.from(usageEvents)
			.where(and(eq(usageEvents.workspaceId, parsed.data.workspaceId)))
			.orderBy(desc(usageEvents.createdAt))
			.limit(parsed.data.limit);
		const totals = events.reduce(
			(acc, event) => ({
				inputTokens: acc.inputTokens + (event.inputTokens ?? 0),
				outputTokens: acc.outputTokens + (event.outputTokens ?? 0),
				events: acc.events + 1,
			}),
			{ inputTokens: 0, outputTokens: 0, events: 0 },
		);
		return NextResponse.json({ totals, events });
	} catch (error) {
		logger.error("Failed to list usage events", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
