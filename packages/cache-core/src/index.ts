import { createRequire } from "node:module";

import RedisMock from "ioredis-mock";

const require = createRequire(import.meta.url);
type RedisConnection = import("ioredis").Redis;
type RedisConstructor = new (
  url: string,
  options?: {
    readonly maxRetriesPerRequest?: null;
  }
) => RedisConnection;
const IORedis = require("ioredis") as RedisConstructor;

export interface CacheStoreStatus {
  readonly backend: "redis" | "mock-redis";
  readonly namespace: string;
  readonly defaultTtls: Readonly<Record<string, number>>;
}

export interface CacheStoreOptions {
  readonly namespace: string;
  readonly defaultTtls?: Readonly<Record<string, number>>;
}

export interface RememberedCacheValue<TValue> {
  readonly hit: boolean;
  readonly value: TValue;
}

let sharedConnection: RedisConnection | null = null;
let sharedBackend: CacheStoreStatus["backend"] | null = null;

function getRedisConnection(): RedisConnection {
  if (sharedConnection) {
    return sharedConnection;
  }

  const redisUrl = process.env["INFRALYNX_REDIS_URL"];
  sharedBackend = redisUrl ? "redis" : "mock-redis";
  sharedConnection = redisUrl
    ? new IORedis(redisUrl, {
        maxRetriesPerRequest: null
      })
    : new RedisMock();

  return sharedConnection;
}

function normalizeKeyPart(value: string) {
  return value.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9:_-]/g, "_");
}

export class RedisBackedCacheStore {
  readonly #namespace: string;
  readonly #defaultTtls: Readonly<Record<string, number>>;
  readonly #connection: RedisConnection;

  constructor(options: CacheStoreOptions) {
    this.#namespace = normalizeKeyPart(options.namespace);
    this.#defaultTtls = options.defaultTtls ?? {};
    this.#connection = getRedisConnection();
  }

  buildKey(...parts: readonly string[]) {
    return [this.#namespace, ...parts.map((part) => normalizeKeyPart(part))].join(":");
  }

  getDefaultTtl(cacheKind: string, fallbackSeconds: number) {
    return this.#defaultTtls[cacheKind] ?? fallbackSeconds;
  }

  async getJson<TValue>(key: string): Promise<TValue | null> {
    const raw = await this.#connection.get(key);

    if (typeof raw !== "string") {
      return null;
    }

    return JSON.parse(raw) as TValue;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.#connection.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async delete(key: string) {
    await this.#connection.del(key);
  }

  async deleteByPrefix(prefix: string) {
    const match = `${this.buildKey(prefix)}*`;
    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.#connection.scan(cursor, "MATCH", match, "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await this.#connection.del(...keys);
      }
    } while (cursor !== "0");

    return deleted;
  }

  async rememberJson<TValue>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<TValue> | TValue
  ): Promise<RememberedCacheValue<TValue>> {
    const existing = await this.getJson<TValue>(key);

    if (existing !== null) {
      return {
        hit: true,
        value: existing
      };
    }

    const value = await loader();
    await this.setJson(key, value, ttlSeconds);

    return {
      hit: false,
      value
    };
  }

  getStatus(): CacheStoreStatus {
    return {
      backend: sharedBackend ?? "mock-redis",
      namespace: this.#namespace,
      defaultTtls: this.#defaultTtls
    };
  }
}

export function createCacheStore(options: CacheStoreOptions) {
  return new RedisBackedCacheStore(options);
}
