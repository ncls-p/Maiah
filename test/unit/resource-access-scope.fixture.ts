import { vi } from "vitest";

import * as _authorizationModule from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";

export type Chain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  then: Promise<unknown[]>["then"];
};

export const selectResults: unknown[][] = [];
export const mutationSets: unknown[] = [];

export const dbModule = _dbModule as unknown as {
  db: {
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
};
export const authorizationModule = _authorizationModule as unknown as {
  authorization: {
    hasPermission: ReturnType<typeof vi.fn>;
    invalidatePermissionCache: ReturnType<typeof vi.fn>;
  };
};

export function chain(result: unknown[] = []): Chain {
  const promise = Promise.resolve(result);
  const query = {} as Chain;
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.set = vi.fn((value: unknown) => {
    mutationSets.push(value);
    return query;
  });
  query.values = vi.fn(() => query);
  query.onConflictDoNothing = vi.fn(() => query);
  query.then = promise.then.bind(promise);
  return query;
}

export function resetScopeMocks() {
  selectResults.length = 0;
  mutationSets.length = 0;
  vi.clearAllMocks();
  dbModule.db.select.mockImplementation(() =>
    chain(selectResults.shift() ?? []),
  );
  dbModule.db.delete.mockImplementation(() => chain());
  dbModule.db.update.mockImplementation(() => chain());
  dbModule.db.insert.mockImplementation(() => chain());
  authorizationModule.authorization.hasPermission.mockResolvedValue(false);
  authorizationModule.authorization.invalidatePermissionCache.mockResolvedValue(
    undefined,
  );
}
