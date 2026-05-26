import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	listMarketplaceItems,
	publishAgentDraft,
} from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const createSchema = z.object({
	workspaceId: z.uuid(),
	agentId: z.uuid(),
	version: z.string().min(1).max(32).default("1.0.0"),
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(2048).optional(),
	visibility: z
		.enum(["public", "private", "unlisted", "organization"])
		.optional(),
});

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const status = searchParams.get("status") || undefined;
		const includeDrafts = searchParams.get("includeDrafts") === "true";
		return NextResponse.json(
			await listMarketplaceItems({ status, includeDrafts }),
		);
	} catch (error) {
		logger.error("Failed to list marketplace items", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const parsed = createSchema.safeParse(await req.json());
		if (!parsed.success)
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		const permission = await authorization.requirePermission(
			{ principalType: "user", principalId: session.user.id },
			"marketplaceItems.publish",
			"workspace",
			parsed.data.workspaceId,
		);
		if (!permission.granted)
			return NextResponse.json(
				{ error: "Forbidden", reason: permission.reason },
				{ status: 403 },
			);
		return NextResponse.json(
			await publishAgentDraft({ ...parsed.data, userId: session.user.id }),
			{ status: 201 },
		);
	} catch (error) {
		logger.error("Failed to create marketplace draft", {}, error as Error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{
				status:
					error instanceof Error && error.message.includes("not found")
						? 404
						: 500,
			},
		);
	}
}
