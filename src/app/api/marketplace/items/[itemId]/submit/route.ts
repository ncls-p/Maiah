import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import {
	getMarketplaceItem,
	submitMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { authorization } from "@/server/domain/services/authorization";

export async function POST(
	_req: Request,
	{ params }: { params: Promise<{ itemId: string }> },
) {
	try {
		const session = await getSession();
		if (!session)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
				"marketplace.publish",
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
			await submitMarketplaceItem(itemId, session.user.id),
		);
	} catch (error) {
		logger.error("Failed to submit marketplace item", {}, error as Error);
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
