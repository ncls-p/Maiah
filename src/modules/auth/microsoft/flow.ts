import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/infrastructure/db";
import { verifications } from "@/server/infrastructure/db/schema";
import { readMicrosoftConfig } from "./settings";
import { createMicrosoftAuth } from "./provider";

const stateSchema = z.object({
  organizationId: z.uuid(),
  microsoftRevision: z.string(),
});

export async function microsoftCallback(request: Request) {
  const state = new URL(request.url).searchParams.get("state");
  if (!state || state.length > 256)
    return Response.json({ error: "Invalid OAuth state" }, { status: 400 });
  const [row] = await db
    .select({ value: verifications.value })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, state),
        gt(verifications.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const parsed = stateSchema.safeParse(row ? JSON.parse(row.value) : null);
  if (!parsed.success)
    return Response.json(
      { error: "Expired OAuth state. Restart sign-in." },
      { status: 400 },
    );
  const config = await readMicrosoftConfig(parsed.data.organizationId);
  if (
    !config?.enabled ||
    !config.approved ||
    config.revision !== parsed.data.microsoftRevision
  )
    return Response.json(
      { error: "Microsoft configuration changed. Restart sign-in." },
      { status: 400 },
    );
  const auth = await createMicrosoftAuth(parsed.data.organizationId, config);
  // Better Auth consumes the state and checks its signed browser cookie and PKCE.
  return auth.handler(request);
}
