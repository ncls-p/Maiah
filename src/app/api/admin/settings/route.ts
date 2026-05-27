import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import {
	ensureBootstrapAdmin,
	getRegistrationSetting,
	isAdminRole,
	setRegistrationEnabled,
} from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";

const updateSettingsSchema = z.object({
	registrationEnabled: z.boolean(),
});

export async function GET() {
	try {
		return NextResponse.json(await getRegistrationSetting());
	} catch (error) {
		logger.error("Failed to read admin settings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: NextRequest) {
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

		const parsed = updateSettingsSchema.safeParse(await req.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid input", details: parsed.error.issues },
				{ status: 400 },
			);
		}

		const setting = await setRegistrationEnabled(
			parsed.data.registrationEnabled,
			session.user.id,
		);
		return NextResponse.json(setting);
	} catch (error) {
		logger.error("Failed to update admin settings", {}, error as Error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
