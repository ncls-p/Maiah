import { AsyncLocalStorage } from "node:async_hooks";

import type { AuthContext } from "@/modules/auth/resolve-auth";

const requestAuthStorage = new AsyncLocalStorage<AuthContext>();

export function runWithRequestAuth<T>(auth: AuthContext, callback: () => T): T {
  return requestAuthStorage.run(auth, callback);
}

export function getRequestAuthContext() {
  return requestAuthStorage.getStore() ?? null;
}
