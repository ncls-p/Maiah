import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import { testChatAutomationConnection } from "@/modules/chat/automation";

async function requireAdmin() {
	const session = await getSession();
	if (!session) {
		return {
			ok: false as const,
			response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}
	const bootstrappedAdminId = await ensureBootstrapAdmin();
	const isAdmin =
		isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id;
	if (!isAdmin) {
		return {
			ok: false as const,
			response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
		};
	}
	return { ok: true as const, session };
}

export async function POST() {
	try {
		const auth = await requireAdmin();
		if (!auth.ok) return auth.response;

		const result = await testChatAutomationConnection();
		if (!result.ok) {
			return NextResponse.json(result, { status: 400 });
		}
		return NextResponse.json(result);
	} catch (error) {
		logger.error("Failed to test chat automation", {}, error as Error);
		return NextResponse.json(
			{ ok: false, error: "Internal server error" },
			{ status: 500 },
		);
	}
}
