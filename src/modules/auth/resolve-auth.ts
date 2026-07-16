import { headers } from "next/headers";

import { verifyWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { getSession } from "@/modules/auth/session";

export type AuthContext =
  | {
      type: "user";
      userId: string;
      email: string;
      name: string;
      role?: string | null;
    }
  | {
      type: "api_key";
      apiKeyId: string;
      workspaceId: string;
      userId: string;
      scopes: string[];
    };

function bearerTokenFrom(headersList: Headers) {
  const authorization = headersList.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

export async function resolveAuthContext(
  request?: Request,
): Promise<AuthContext | null> {
  const headerList = request?.headers ?? (await headers());
  const rawKey = bearerTokenFrom(headerList);
  if (rawKey) {
    const verified = await verifyWorkspaceApiKey(rawKey);
    if (!verified) return null;

    return {
      type: "api_key",
      apiKeyId: verified.id,
      workspaceId: verified.workspaceId,
      userId: verified.createdById,
      scopes: verified.scopes,
    };
  }

  const session = await getSession();
  if (session?.user) {
    return {
      type: "user",
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    };
  }

  return null;
}

export function getActorUserId(context: AuthContext) {
  return context.type === "user" ? context.userId : context.userId;
}
