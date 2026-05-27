import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
	ensureBootstrapAdmin,
	isAdminRole,
	updateManagedUser,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

const paramsSchema = z.object({ userId: z.uuid() });
const updateUserSchema = z.object({
	role: z.enum(["user", "admin"]).optional(),
	banned: z.boolean().optional(),
	banReason: z.string().max(500).optional(),
});

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ userId: string }> },
) {
	try {
		const session = await getSession();
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const bootstrappedAdminId = await ensureBootstrapAdmin();
		const isAdmin =
			isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id;
		if (!isAdmin) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const parsedParams = paramsSchema.safeParse(await params);
		const parsedBody = updateUserSchema.safeParse(await req.json());
		if (!parsedParams.success || !parsedBody.success) {
			return NextResponse.json(
				{
					error: "Invalid input",
					details: parsedBody.success ? undefined : parsedBody.error.issues,
				},
				{ status: 400 },
			);
		}

		const user = await updateManagedUser({
			actorUserId: session.user.id,
			userId: parsedParams.data.userId,
			...parsedBody.data,
		});

		return NextResponse.json({ user });
	} catch (error) {
		logger.error("Failed to update user", {}, error as Error);
		const message =
			error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
