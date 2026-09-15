import {
  listConnectionSessions,
  reconcileSession,
} from "@/modules/genesys/reconciliation";
import { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { env } from "@/lib/env";
import {
  connectionView,
  requireConnectionAdmin,
  saveConnection,
  testConnection,
} from "@/modules/genesys/connections";
import { genesysResponse } from "@/modules/genesys/route-response";
type Context = { params: Promise<{ organizationId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return handleRoute(
    req,
    ({ session }) =>
      genesysResponse(async () => {
        const id = z.uuid().parse((await context.params).organizationId);
        await requireConnectionAdmin(session.user.id, id);
        const connection = await connectionView(id);
        return {
          sessions: await listConnectionSessions(id),
          connection,
          webhookUrl: connection
            ? new URL(
                `/api/webhooks/genesys/${connection.id}`,
                env.BETTER_AUTH_URL,
              ).toString()
            : null,
        };
      }),
    { allowApiKey: false },
  );
}
export async function PUT(req: NextRequest, context: Context) {
  return handleRoute(
    req,
    ({ session }) =>
      genesysResponse(async () => {
        const id = z.uuid().parse((await context.params).organizationId);
        return {
          connection: await saveConnection(
            session.user.id,
            id,
            await req.json(),
          ),
        };
      }),
    { allowApiKey: false },
  );
}
export async function POST(req: NextRequest, context: Context) {
  return handleRoute(
    req,
    ({ session }) =>
      genesysResponse(async () => {
        const id = z.uuid().parse((await context.params).organizationId);
        await requireConnectionAdmin(session.user.id, id);
        const body = await req.text();
        if (body) {
          const input = z
            .object({
              action: z.literal("reconcile"),
              sessionId: z.uuid(),
              externalConversationId: z.uuid(),
            })
            .parse(JSON.parse(body));
          return reconcileSession(
            session.user.id,
            id,
            input.sessionId,
            input.externalConversationId,
          );
        }
        const connection = await connectionView(id);
        const webhookUrl = new URL(
          `/api/webhooks/genesys/${connection?.id}`,
          env.BETTER_AUTH_URL,
        ).toString();
        return testConnection(session.user.id, id, webhookUrl);
      }),
    { allowApiKey: false },
  );
}
