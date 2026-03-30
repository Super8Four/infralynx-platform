import type { DatabaseEngine } from "../../db-abstraction/dist/index.js";

export type SortDirection = "asc" | "desc";

export interface PaginationRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface PaginationMetadata {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface PaginatedResult<TRecord> {
  readonly items: readonly TRecord[];
  readonly pagination: PaginationMetadata;
}

export interface PaginationOptions {
  readonly defaultPage?: number;
  readonly defaultPageSize?: number;
  readonly maxPageSize?: number;
}

export interface QueryStandard {
  readonly rule: string;
  readonly rationale: string;
}

export interface QueryReviewRecord {
  readonly id: string;
  readonly domain: "inventory" | "auth" | "rbac" | "search" | "audit" | "workflow";
  readonly queryShape: string;
  readonly filters: readonly string[];
  readonly sortFields: readonly string[];
  readonly recommendedIndexIds: readonly string[];
  readonly paginationStrategy: "offset-limit";
  readonly explainPlanFocus: readonly string[];
}

export interface IndexDefinition {
  readonly id: string;
  readonly tableName: string;
  readonly columns: readonly string[];
  readonly unique?: boolean;
  readonly includeColumns?: readonly string[];
  readonly predicate?: string;
  readonly appliesTo: readonly DatabaseEngine[];
  readonly rationale: string;
  readonly engineNotes?: Readonly<Partial<Record<DatabaseEngine, string>>>;
}

export const paginationStandard = {
  defaultPage: 1,
  defaultPageSize: 25,
  maxPageSize: 100
} as const;

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value ?? "");

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function compareValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function normalizeQueryText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function createPaginationRequest(
  searchParams: Pick<URLSearchParams, "get">,
  options: PaginationOptions = {}
): PaginationRequest {
  const page = normalizePositiveInteger(searchParams.get("page"), options.defaultPage ?? paginationStandard.defaultPage);
  const pageSize = Math.min(
    options.maxPageSize ?? paginationStandard.maxPageSize,
    normalizePositiveInteger(searchParams.get("pageSize"), options.defaultPageSize ?? paginationStandard.defaultPageSize)
  );

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

export function sortRecordsByField<TRecord>(
  records: readonly TRecord[],
  field: string,
  direction: SortDirection,
  fallbackField = "id"
) {
  return [...records].sort((left, right) => {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const comparison = compareValues(leftRecord[field], rightRecord[field]);

    if (comparison !== 0) {
      return direction === "asc" ? comparison : -comparison;
    }

    const fallbackComparison = compareValues(leftRecord[fallbackField], rightRecord[fallbackField]);
    return direction === "asc" ? fallbackComparison : -fallbackComparison;
  });
}

export function paginateRecords<TRecord>(
  records: readonly TRecord[],
  request: PaginationRequest
): PaginatedResult<TRecord> {
  const items = records.slice(request.offset, request.offset + request.pageSize);
  const totalPages = Math.max(1, Math.ceil(records.length / request.pageSize));

  return {
    items,
    pagination: {
      page: request.page,
      pageSize: request.pageSize,
      offset: request.offset,
      total: records.length,
      totalPages,
      hasNextPage: request.page < totalPages,
      hasPreviousPage: request.page > 1
    }
  };
}

export const queryStandards: readonly QueryStandard[] = [
  {
    rule: "Use deterministic sort order with a stable fallback column.",
    rationale: "Pagination must not drift between requests when primary sort values tie."
  },
  {
    rule: "Normalize pagination to bounded offset/limit semantics at the API edge.",
    rationale: "Cross-engine compatibility is easier when the transport contract is consistent."
  },
  {
    rule: "Filter before paginating and only compute display-side enrichments that the response needs.",
    rationale: "Avoid repeated full-record transforms and accidental N+1 expansion patterns."
  },
  {
    rule: "Design every index around a concrete filter-plus-sort query shape.",
    rationale: "Generic indexing adds write cost without reliably improving critical reads."
  }
];

export const explainPlanCommands: Readonly<Record<DatabaseEngine, readonly string[]>> = {
  postgres: [
    "EXPLAIN (ANALYZE, BUFFERS) SELECT ...",
    "Use reference plans to confirm index scans and pagination sort stability."
  ],
  mssql: [
    "SET STATISTICS IO, TIME ON;",
    "Use the actual execution plan for filtered + ordered queries."
  ],
  mariadb: [
    "EXPLAIN FORMAT=JSON SELECT ...",
    "Confirm composite index usage on filtered list queries and search lookups."
  ]
};

export const indexDefinitions: readonly IndexDefinition[] = [
  {
    id: "idx_sites_tenant_slug",
    tableName: "sites",
    columns: ["tenant_id", "slug"],
    unique: true,
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Supports tenant-scoped site lookups and deterministic site listing."
  },
  {
    id: "idx_racks_site_name",
    tableName: "racks",
    columns: ["site_id", "name"],
    unique: true,
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Supports rack list pages filtered by site and sorted by rack name."
  },
  {
    id: "idx_devices_site_role_status_name",
    tableName: "devices",
    columns: ["site_id", "role", "status", "name"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes device list filtering on site, role, and status with name-ordered pagination."
  },
  {
    id: "idx_devices_rack_position",
    tableName: "devices",
    columns: ["rack_id", "starting_unit"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes rack detail views and device placement lookups."
  },
  {
    id: "idx_prefixes_vrf_cidr",
    tableName: "prefixes",
    columns: ["vrf_id", "cidr"],
    unique: true,
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Supports prefix containment validation and VRF-scoped list ordering.",
    engineNotes: {
      postgres: "Promote to inet/cidr-native indexing when persistent Postgres schema lands."
    }
  },
  {
    id: "idx_prefixes_parent_prefix",
    tableName: "prefixes",
    columns: ["parent_prefix_id", "cidr"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes child-prefix expansion and hierarchy checks."
  },
  {
    id: "idx_ip_addresses_prefix_status_address",
    tableName: "ip_addresses",
    columns: ["prefix_id", "status", "address"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Supports prefix detail pages, address filtering, and deterministic pagination."
  },
  {
    id: "idx_ip_addresses_interface_id",
    tableName: "ip_addresses",
    columns: ["interface_id"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes interface and device relationship expansion."
  },
  {
    id: "idx_auth_providers_enabled_default",
    tableName: "auth_providers",
    columns: ["enabled", "is_default", "type"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes enabled-provider and default-provider login bootstrap queries."
  },
  {
    id: "idx_sessions_user_expires_at",
    tableName: "sessions",
    columns: ["user_id", "expires_at"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes session refresh, lookup, and cleanup queries."
  },
  {
    id: "idx_role_assignments_user_scope",
    tableName: "role_assignments",
    columns: ["user_id", "scope_type", "scope_id"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes RBAC grant expansion for the authenticated user."
  },
  {
    id: "idx_provider_role_mappings_provider_claim",
    tableName: "provider_role_mappings",
    columns: ["provider_id", "claim_type", "claim_key", "claim_value"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes external-group and claim mapping during login."
  },
  {
    id: "idx_audit_timestamp_action",
    tableName: "audit_logs",
    columns: ["timestamp", "action"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes recent-audit queries and action filtering."
  },
  {
    id: "idx_jobs_status_created_at",
    tableName: "jobs",
    columns: ["status", "created_at"],
    appliesTo: ["postgres", "mssql", "mariadb"],
    rationale: "Optimizes operations views and queue inspection."
  }
] as const;

export const criticalQueryReviews: readonly QueryReviewRecord[] = [
  {
    id: "inventory-sites-list",
    domain: "inventory",
    queryShape: "List sites filtered by tenant and query, ordered by name.",
    filters: ["tenant_id", "query"],
    sortFields: ["name", "id"],
    recommendedIndexIds: ["idx_sites_tenant_slug"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["index seek on tenant_id", "ordered pagination without extra sort spill"]
  },
  {
    id: "inventory-devices-list",
    domain: "inventory",
    queryShape: "List devices filtered by site, role, and status, ordered by name.",
    filters: ["site_id", "role", "status", "query"],
    sortFields: ["name", "id"],
    recommendedIndexIds: ["idx_devices_site_role_status_name"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["composite index coverage", "no repeated per-row interface lookups"]
  },
  {
    id: "inventory-prefixes-list",
    domain: "inventory",
    queryShape: "List prefixes filtered by VRF and status, ordered by CIDR.",
    filters: ["vrf_id", "status", "query"],
    sortFields: ["cidr", "id"],
    recommendedIndexIds: ["idx_prefixes_vrf_cidr", "idx_prefixes_parent_prefix"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["vrf-scoped seek", "stable parent-child expansion"]
  },
  {
    id: "inventory-ip-addresses-list",
    domain: "inventory",
    queryShape: "List addresses filtered by prefix and status, ordered by address.",
    filters: ["prefix_id", "status", "query"],
    sortFields: ["address", "id"],
    recommendedIndexIds: ["idx_ip_addresses_prefix_status_address", "idx_ip_addresses_interface_id"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["prefix-scoped address seek", "avoid repeated interface/device relationship scans"]
  },
  {
    id: "auth-enabled-providers",
    domain: "auth",
    queryShape: "Fetch enabled authentication providers with default-provider resolution.",
    filters: ["enabled", "is_default", "type"],
    sortFields: ["type", "id"],
    recommendedIndexIds: ["idx_auth_providers_enabled_default"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["single-pass enabled/default resolution"]
  },
  {
    id: "rbac-assignment-expansion",
    domain: "rbac",
    queryShape: "Expand role assignments and provider mappings for one user during auth/session resolution.",
    filters: ["user_id", "provider_id", "claim_type", "claim_key", "claim_value"],
    sortFields: ["scope_type", "scope_id"],
    recommendedIndexIds: ["idx_role_assignments_user_scope", "idx_provider_role_mappings_provider_claim"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["identity-bound role expansion without full-table scans"]
  },
  {
    id: "audit-recent-events",
    domain: "audit",
    queryShape: "Read recent audit records filtered by action and time window.",
    filters: ["timestamp", "action"],
    sortFields: ["timestamp", "id"],
    recommendedIndexIds: ["idx_audit_timestamp_action"],
    paginationStrategy: "offset-limit",
    explainPlanFocus: ["descending time-window scans"]
  }
] as const;

function quoteIdentifier(engine: DatabaseEngine, identifier: string) {
  if (engine === "postgres") {
    return `"${identifier}"`;
  }

  if (engine === "mssql") {
    return `[${identifier}]`;
  }

  return `\`${identifier}\``;
}

function renderSingleIndex(engine: DatabaseEngine, index: IndexDefinition) {
  const indexName = quoteIdentifier(engine, index.id);
  const tableName = quoteIdentifier(engine, index.tableName);
  const columns = index.columns.map((column) => quoteIdentifier(engine, column)).join(", ");
  const unique = index.unique ? "UNIQUE " : "";
  const whereClause = index.predicate ? ` WHERE ${index.predicate}` : "";

  if (engine === "mssql") {
    const includeClause =
      index.includeColumns && index.includeColumns.length > 0
        ? ` INCLUDE (${index.includeColumns.map((column) => quoteIdentifier(engine, column)).join(", ")})`
        : "";
    return `CREATE ${unique}INDEX ${indexName} ON ${tableName} (${columns})${includeClause}${whereClause};`;
  }

  if (engine === "postgres") {
    return `CREATE ${unique}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})${whereClause};`;
  }

  return `CREATE ${unique}INDEX ${indexName} ON ${tableName} (${columns})${whereClause};`;
}

export function renderIndexMigration(engine: DatabaseEngine) {
  return indexDefinitions
    .filter((definition) => definition.appliesTo.includes(engine))
    .map((definition) => [`-- ${definition.id}: ${definition.rationale}`, renderSingleIndex(engine, definition)].join("\n"))
    .join("\n\n");
}
