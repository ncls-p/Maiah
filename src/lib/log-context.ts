import { AsyncLocalStorage } from "node:async_hooks";

type LogContext = { requestId?: string; diagnosticId?: string };
const storage = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: LogContext, action: () => T): T {
  return storage.run({ ...storage.getStore(), ...context }, action);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}
