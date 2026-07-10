import { NextResponse } from "next/server";

import { ensureBootstrapAdmin, isAdminRole } from "@/modules/admin/use-cases";
import { getSession } from "@/modules/auth/session";
import { authorization } from "@/server/domain/services/authorization";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function isPlatformAdminSession(session: Session | null) {
  if (!session) return false;
  const bootstrappedAdminId = await ensureBootstrapAdmin();
  return (
    isAdminRole(session.user.role) || bootstrappedAdminId === session.user.id
  );
}

export async function canManageTenantGlobals(
  session: Session | null,
  workspaceId: string,
) {
  if (!session) return false;
  if (await isPlatformAdminSession(session)) return true;
  return authorization.hasPermission(
    { principalType: "user", principalId: session.user.id },
    "roles.manage",
    "workspace",
    workspaceId,
  );
}

export async function requireAdminApiSession(): Promise<
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse<{ error: string }> }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!(await isPlatformAdminSession(session))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, session };
}
