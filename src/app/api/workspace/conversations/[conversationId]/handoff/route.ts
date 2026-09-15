import { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  handoffView,
  requestHandoff,
  resumeAi,
  sendHumanMessage,
} from "@/modules/genesys/sessions";
import { genesysResponse } from "@/modules/genesys/route-response";
const mutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    reason: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(3000),
  }),
  z.object({
    action: z.literal("message"),
    messageId: z.uuid(),
    text: z.string().trim().min(1).max(3000),
  }),
  z.object({ action: z.literal("resume") }),
]);
type Context = { params: Promise<{ conversationId: string }> };
export async function GET(req: NextRequest, context: Context) {
  return handleRoute(
    req,
    ({ session }) =>
      genesysResponse(async () =>
        handoffView(
          session.user.id,
          z.uuid().parse((await context.params).conversationId),
        ),
      ),
    { allowApiKey: false },
  );
}
export async function POST(req: NextRequest, context: Context) {
  return handleRoute(
    req,
    ({ session }) =>
      genesysResponse(async () => {
        const id = z.uuid().parse((await context.params).conversationId);
        const input = mutation.parse(await req.json());
        if (input.action === "request")
          return requestHandoff(session.user.id, id, input);
        if (input.action === "message")
          return sendHumanMessage(
            session.user.id,
            id,
            input.messageId,
            input.text,
          );
        return resumeAi(session.user.id, id);
      }),
    { allowApiKey: false },
  );
}
