import { createHash } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

import {
  createCacheStore,
  type CacheStoreStatus
} from "../../../../packages/cache-core/dist/index.js";
import {
  resolveRequestAuthIdentity,
  type AuthIdentity,
  type FileBackedAuthRepository
} from "../../../../packages/auth-core/dist/index.js";

type CachedJsonPayload = Record<string, unknown> | readonly unknown[];

const ttlByKind = {
  overview: 30,
  topology: 45,
  rack: 45,
  ipamTree: 45,
  search: 30,
  inventoryNavigation: 45,
  inventoryList: 45,
  inventoryDetail: 60,
  authEnabledProviders: 60,
  authProviders: 45,
  authProviderDetail: 45,
  authSession: 20,
  authIdentity: 20,
  rbacSummary: 20,
  rbacSnapshot: 30
} as const;

const apiCacheStore = createCacheStore({
  namespace: "infralynx:api",
  defaultTtls: ttlByKind
});

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function buildRequestIdentityToken(request: IncomingMessage) {
  const authorizationHeader = typeof request.headers["authorization"] === "string"
    ? request.headers["authorization"]
    : "";
  const actorId = typeof request.headers["x-infralynx-actor-id"] === "string"
    ? request.headers["x-infralynx-actor-id"]
    : "";
  const tenantId = typeof request.headers["x-infralynx-tenant-id"] === "string"
    ? request.headers["x-infralynx-tenant-id"]
    : "";
  const roleIds = typeof request.headers["x-infralynx-role-ids"] === "string"
    ? request.headers["x-infralynx-role-ids"]
    : "";

  return hashValue([authorizationHeader, actorId, tenantId, roleIds].join("|"));
}

export function getCacheStatus(): CacheStoreStatus {
  return apiCacheStore.getStatus();
}

export function buildScopedCacheKey(
  request: IncomingMessage,
  cacheKind: keyof typeof ttlByKind,
  ...parts: readonly string[]
) {
  return apiCacheStore.buildKey(
    cacheKind,
    buildRequestIdentityToken(request),
    ...parts
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  cacheState: "hit" | "miss" | "bypass" = "bypass"
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-InfraLynx-Cache": cacheState
  });
  response.end(JSON.stringify(payload));
}

export async function sendCachedJsonResponse<TPayload extends CachedJsonPayload>(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly cacheKind: keyof typeof ttlByKind;
    readonly keyParts: readonly string[];
    readonly statusCode?: number;
  },
  loader: () => Promise<TPayload> | TPayload
) {
  const key = buildScopedCacheKey(request, options.cacheKind, ...options.keyParts);
  const remembered = await apiCacheStore.rememberJson(
    key,
    apiCacheStore.getDefaultTtl(options.cacheKind, 30),
    loader
  );

  sendJson(response, options.statusCode ?? 200, remembered.value, remembered.hit ? "hit" : "miss");
  return remembered.value;
}

export async function resolveCachedAuthIdentity(input: {
  readonly request: IncomingMessage;
  readonly repository: FileBackedAuthRepository;
  readonly masterKeyPath: string;
}): Promise<AuthIdentity | null> {
  const authorizationHeader = typeof input.request.headers["authorization"] === "string"
    ? input.request.headers["authorization"]
    : undefined;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const key = apiCacheStore.buildKey("authIdentity", hashValue(authorizationHeader));
  const remembered = await apiCacheStore.rememberJson<AuthIdentity | null>(
    key,
    apiCacheStore.getDefaultTtl("authIdentity", 20),
    async () => resolveRequestAuthIdentity({
      authorizationHeader,
      repository: input.repository,
      masterKeyPath: input.masterKeyPath
    })
  );

  return remembered.value;
}

export async function invalidateCacheByPrefix(...prefixes: readonly string[]) {
  let deleted = 0;

  for (const prefix of prefixes) {
    deleted += await apiCacheStore.deleteByPrefix(prefix);
  }

  return deleted;
}

export async function invalidateInventoryCache() {
  return invalidateCacheByPrefix(
    "inventoryNavigation",
    "inventoryList",
    "inventoryDetail",
    "search"
  );
}

export async function invalidateAuthCache() {
  return invalidateCacheByPrefix(
    "authEnabledProviders",
    "authProviders",
    "authProviderDetail",
    "authSession",
    "authIdentity",
    "rbacSummary",
    "rbacSnapshot"
  );
}

export async function invalidateRbacCache() {
  return invalidateCacheByPrefix("rbacSummary", "rbacSnapshot", "authSession", "authIdentity");
}

export async function invalidateDerivedApiCache() {
  return invalidateCacheByPrefix("overview", "topology", "rack", "ipamTree", "search");
}
