import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  requireCompanion,
  CompanionAccessError,
} from "@/modules/companion/settings";
import { pageContextSchema } from "@/modules/companion/contracts";
import { acknowledgeAction, pollPage } from "@/modules/companion/bridge";
const scopeSchema = z.object({ workspaceId: z.uuid(), contextId: z.uuid() });
export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const input = scopeSchema
        .extend({ page: pageContextSchema.nullable() })
        .safeParse(await req.json());
      if (!input.success)
        return NextResponse.json({ error: "Invalid context" }, { status: 400 });
      await requireCompanion(session.user.id, input.data.workspaceId);
      const commands = await pollPage(
        session.user.id,
        input.data.workspaceId,
        input.data.contextId,
        input.data.page,
      );
      return NextResponse.json({ commands });
    },
    {
      allowApiKey: false,
      expectedError: (error) =>
        error instanceof CompanionAccessError
          ? NextResponse.json({ error: error.message }, { status: 403 })
          : null,
    },
  );
}
export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const input = scopeSchema
        .extend({
          id: z.uuid(),
          result: z.object({
            ok: z.boolean(),
            error: z.string().max(1000).optional(),
          }),
        })
        .safeParse(await req.json());
      if (!input.success)
        return NextResponse.json({ error: "Invalid result" }, { status: 400 });
      await requireCompanion(session.user.id, input.data.workspaceId);
      await acknowledgeAction(
        session.user.id,
        input.data.workspaceId,
        input.data.contextId,
        input.data.id,
        input.data.result,
      );
      return NextResponse.json({ ok: true });
    },
    {
      allowApiKey: false,
      expectedError: (error) =>
        error instanceof CompanionAccessError
          ? NextResponse.json({ error: error.message }, { status: 403 })
          : null,
    },
  );
}
