import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	getMarketplaceItem,
	reviewMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

const schema = z.object({
	status: z.enum(["approved", "rejected", "changes_requested"]),
	notes: z.string().max(4000).optional(),
	versionId: z.uuid().optional(),
});

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		const parsed = schema.safeParse(await req.json());
		if (!parsed.success)
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		const { itemId } = await params;
		const item = await getMarketplaceItem(itemId);
		if (!item)
			return NextResponse.json(
				{ error: "Marketplace item not found" },
				{ status: 404 },
			);
		if (item.publisherWorkspaceId) {
			const permission = await authorization.requirePermission(
				{ principalType: "user", principalId: session.user.id },
				"marketplace.review",
				"workspace",
				item.publisherWorkspaceId,
			);
			if (!permission.granted)
				return NextResponse.json(
					{ error: "Forbidden", reason: permission.reason },
					{ status: 403 },
				);
		}
		return NextResponse.json(
			await reviewMarketplaceItem({
				itemId,
				reviewerUserId: session.user.id,
				...parsed.data,
			}),
		);
	} catch (error) {
		logger.error("Failed to review marketplace item", {}, error as Error);
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
