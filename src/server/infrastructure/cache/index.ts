import { Redis } from "ioredis";
import { env } from "@/lib/env";

type CacheRuntime = {
  redis: Redis | null;
  retryAfter: number;
};

const CACHE_CONNECT_TIMEOUT_MS = 250;
const CACHE_RETRY_DELAY_MS = 5_000;
const globalCache = globalThis as typeof globalThis & {
  __maiahCacheRuntime?: CacheRuntime;
};
const runtime = (globalCache.__maiahCacheRuntime ??= {
  redis: null,
  retryAfter: 0,
});

function getCache(): Redis {
  if (runtime.redis && runtime.redis.status !== "end") return runtime.redis;
  if (Date.now() < runtime.retryAfter) {
    throw new Error("Cache temporarily unavailable");
  }

  const redis = new Redis(env.DRAGONFLY_URL, {
    password: env.DRAGONFLY_PASSWORD || undefined,
    connectTimeout: CACHE_CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  runtime.redis = redis;
  redis.on("error", () => {
    runtime.retryAfter = Date.now() + CACHE_RETRY_DELAY_MS;
  });
  redis.on("end", () => {
    if (runtime.redis === redis) runtime.redis = null;
    runtime.retryAfter = Date.now() + CACHE_RETRY_DELAY_MS;
  });

  return redis;
}

export const cache = {
  async get<T = string>(key: string): Promise<T | null> {
    try {
      const val = await getCache().get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await getCache().setex(key, ttlSeconds, serialized);
      } else {
        await getCache().set(key, serialized);
      }
    } catch {
      // Cache writes are best-effort
    }
  },

  async del(key: string): Promise<void> {
    try {
      await getCache().del(key);
    } catch {
      // Cache deletes are best-effort
    }
  },

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const redis = getCache();
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          200,
        );
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    } catch {
      // Cache deletes are best-effort
    }
  },

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const val = await getCache().incr(key);
      if (ttlSeconds) {
        await getCache().expire(key, ttlSeconds);
      }
      return val;
    } catch {
      return 0;
    }
  },
};
