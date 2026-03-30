import {
  authRedirectStartRequestSchema,
  cacheStatusResponseSchema,
  createJobRequestSchema,
  createStandardErrorResponse,
  createVersionedMeta,
  inventoryListQuerySchema,
  legacyApiPrefix,
  localLoginRequestSchema,
  logoutRequestSchema,
  overviewResponseSchema,
  providerSaveRequestSchema,
  refreshRequestSchema,
  searchQuerySchema,
  searchResponseSchema,
  versionedApiPrefix
} from "../../../../packages/api-contracts/dist/index.js";
import type { ZodType } from "zod";

interface ValidationTarget {
  readonly bodySchema?: ZodType;
  readonly querySchema?: ZodType;
  readonly responseSchema?: ZodType;
}

const inventoryListPattern = /^\/api\/inventory\/(?:sites|racks|devices|prefixes|ip-addresses|tenants|users|vrfs|interfaces|connections)$/;
const inventoryDetailPattern = /^\/api\/inventory\/(?:sites|racks|devices|prefixes|ip-addresses|tenants|users|vrfs|interfaces|connections)\/[^/]+$/;
const authProviderPattern = /^\/api\/auth\/providers\/[^/]+$/;

export function isVersionedApiPath(pathname: string) {
  return pathname === versionedApiPrefix || pathname.startsWith(`${versionedApiPrefix}/`);
}

export function toLegacyApiPath(pathname: string) {
  if (!isVersionedApiPath(pathname)) {
    return pathname;
  }

  const suffix = pathname.slice(versionedApiPrefix.length);
  return suffix.length === 0 ? legacyApiPrefix : `${legacyApiPrefix}${suffix}`;
}

export function createLegacyDeprecationHeaders() {
  return {
    Deprecation: "true",
    "Sunset": "Wed, 30 Jun 2027 00:00:00 GMT",
    Link: '<https://super8four.github.io/infralynx-docs/api/deprecation-policy/>; rel="deprecation"',
    "X-InfraLynx-Api-Version": "legacy"
  } as const;
}

export function createV1Headers() {
  return {
    "X-InfraLynx-Api-Version": "v1"
  } as const;
}

export function createVersionedSuccessPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  if ("meta" in payload) {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    meta: createVersionedMeta(false)
  };
}

export function createVersionedErrorPayload(code: string, message: string, details?: unknown) {
  return createStandardErrorResponse(code, message, details);
}

export function resolveValidationTarget(method: string, pathname: string): ValidationTarget | null {
  if (method === "GET" && pathname === "/api/overview") {
    return { responseSchema: overviewResponseSchema };
  }

  if (method === "GET" && pathname === "/api/search") {
    return {
      querySchema: searchQuerySchema,
      responseSchema: searchResponseSchema
    };
  }

  if (method === "GET" && pathname === "/api/cache/status") {
    return { responseSchema: cacheStatusResponseSchema };
  }

  if (method === "GET" && inventoryListPattern.test(pathname)) {
    return { querySchema: inventoryListQuerySchema };
  }

  if (method === "GET" && inventoryDetailPattern.test(pathname)) {
    return {};
  }

  if (method === "POST" && pathname === "/api/auth/login/local") {
    return { bodySchema: localLoginRequestSchema };
  }

  if (method === "POST" && pathname === "/api/auth/login/oidc/start") {
    return { bodySchema: authRedirectStartRequestSchema };
  }

  if (method === "POST" && pathname === "/api/auth/login/saml/start") {
    return { bodySchema: authRedirectStartRequestSchema };
  }

  if (method === "POST" && pathname === "/api/auth/refresh") {
    return { bodySchema: refreshRequestSchema };
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    return { bodySchema: logoutRequestSchema };
  }

  if (method === "POST" && pathname === "/api/auth/providers") {
    return { bodySchema: providerSaveRequestSchema };
  }

  if (method === "PUT" && authProviderPattern.test(pathname)) {
    return { bodySchema: providerSaveRequestSchema };
  }

  if (method === "POST" && pathname === "/api/jobs") {
    return { bodySchema: createJobRequestSchema };
  }

  return null;
}

export function validateQuery(schema: ZodType | undefined, query: Record<string, unknown>) {
  if (!schema) {
    return { success: true as const, data: query };
  }

  return schema.safeParse(query);
}

export function validateBody(schema: ZodType | undefined, body: unknown) {
  if (!schema) {
    return { success: true as const, data: body };
  }

  return schema.safeParse(body);
}

export function validateResponse(schema: ZodType | undefined, payload: unknown) {
  if (!schema) {
    return { success: true as const, data: payload };
  }

  return schema.safeParse(payload);
}
