import { z } from "zod";

export const apiVersion = "v1" as const;
export const versionedApiPrefix = `/api/${apiVersion}` as const;
export const legacyApiPrefix = "/api" as const;
export const legacyDeprecationDocumentationUrl =
  "https://super8four.github.io/infralynx-docs/api/deprecation-policy/";

export const apiMetaSchema = z.object({
  apiVersion: z.literal(apiVersion),
  deprecated: z.boolean()
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional()
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
  meta: apiMetaSchema
});

export const jsonObjectSchema = z.object({}).catchall(z.unknown());

export const genericSuccessResponseSchema = jsonObjectSchema.extend({
  meta: apiMetaSchema.optional()
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
});

export const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  domain: z.enum(["all", "core", "ipam", "dcim", "operations", "automation"]).optional()
});

export const inventoryListQuerySchema = paginationQuerySchema.extend({
  sortField: z.string().min(1).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional()
}).catchall(z.string());

export const localLoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const ldapLoginRequestSchema = z.object({
  providerId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1)
});

export const authRedirectStartRequestSchema = z.object({
  providerId: z.string().min(1),
  redirectBaseUrl: z.string().url().optional()
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const logoutRequestSchema = z.object({
  sessionId: z.string().min(1)
});

export const providerSaveRequestSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["local", "ldap", "oidc", "saml"]),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  config: jsonObjectSchema
}).extend({
  id: z.string().min(1).optional()
});

export const genericJsonBodySchema = jsonObjectSchema;

export const createJobRequestSchema = z.object({
  type: z.string().min(1),
  payload: jsonObjectSchema
});

export const cacheStatusResponseSchema = jsonObjectSchema.extend({
  generatedAt: z.string(),
  cache: jsonObjectSchema
});

export const overviewResponseSchema = jsonObjectSchema.extend({
  generatedAt: z.string(),
  workspace: z.object({
    name: z.string(),
    runtime: z.string(),
    boundary: z.string()
  }),
  domains: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(["ready", "attention", "planned"]),
      summary: z.string(),
      metrics: z.array(
        z.object({
          label: z.string(),
          value: z.string()
        })
      ),
      indicators: z.array(z.string())
    })
  ),
  notices: z.array(z.string())
});

export const searchResponseSchema = jsonObjectSchema.extend({
  generatedAt: z.string(),
  query: z.string(),
  selectedDomain: z.enum(["all", "core", "ipam", "dcim", "operations", "automation"]),
  totalResults: z.number().int().nonnegative(),
  groups: z.array(
    z.object({
      domain: z.enum(["core", "ipam", "dcim", "operations", "automation"]),
      label: z.string(),
      results: z.array(jsonObjectSchema)
    })
  )
});

export function createVersionedApiPath(path: string) {
  if (path.startsWith(versionedApiPrefix)) {
    return path;
  }

  if (path.startsWith(`${legacyApiPrefix}/`)) {
    return `${versionedApiPrefix}${path.slice(legacyApiPrefix.length)}`;
  }

  return path;
}

export function createVersionedMeta(deprecated = false) {
  return {
    apiVersion,
    deprecated
  };
}

export function createStandardErrorResponse(
  code: string,
  message: string,
  details?: unknown
) {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    },
    meta: createVersionedMeta(false)
  };
}
