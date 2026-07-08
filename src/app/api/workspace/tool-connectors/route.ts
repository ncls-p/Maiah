import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
	handleRoute,
	requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
	createToolConnector,
	listToolConnectors,
} from "@/modules/tool-connections/use-cases";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
	workspaceId: z.uuid(),
	key: z.string().min(1).max(128),
	name: z.string().min(1).max(255),
	description: z.string().max(2048).nullable().optional(),
	kind: z.enum(["mcp", "builtin", "custom"]),
	mcpServerId: z.uuid().nullable().optional(),
	configSchema: jsonRecordSchema.nullable().optional(),
	secretSchema: jsonRecordSchema.nullable().optional(),
	defaultConfig: jsonRecordSchema.nullable().optional(),
	isGlobal: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
	return handleRoute(
		req,
		async ({ session }) => {
			const parsed = querySchema.safeParse({
				workspaceId: req.nextUrl.searchParams.get("workspaceId"),
			});
			if (!parsed.success) {
				return NextResponse.json(
					{ error: "workspaceId must be a valid UUID" },
					{ status: 400 },
				);
			}

			const forbidden = await requireWorkspacePermissionAsync(
				session.user.id,
				parsed.data.workspaceId,
				"tools.configure",
			);
			if (forbidden) return forbidden;

			const canManageGlobal = await canManageTenantGlobals(
				session,
				parsed.data.workspaceId,
			);
			return NextResponse.json(
				await listToolConnectors(
					parsed.data.workspaceId,
					session.user.id,
					canManageGlobal,
				),
			);
		},
		{ logLabel: "Failed to list tool connectors" },
	);
}

export async function POST(req: NextRequest) {
	return handleRoute(
		req,
		async ({ session }) => {
			const parsed = createSchema.safeParse(await req.json());
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

			const canManageGlobal = await canManageTenantGlobals(
				session,
				parsed.data.workspaceId,
			);
			if (parsed.data.isGlobal && !canManageGlobal) {
				return NextResponse.json(
					{ error: "Only admins can make tool connectors global" },
					{ status: 403 },
				);
			}

			const connector = await createToolConnector({
				...parsed.data,
				userId: session.user.id,
				isGlobal: parsed.data.isGlobal && canManageGlobal,
			});
			return NextResponse.json(connector, { status: 201 });
		},
		{
			logLabel: "Failed to create tool connector",
			expectedError: (error) => {
				if (error instanceof Error && error.message.includes("duplicate")) {
					return NextResponse.json(
						{ error: "Tool connector key already exists" },
						{ status: 409 },
					);
				}
				return null;
			},
		},
	);
}
