export type StatusScope =
  | "tenant"
  | "tag"
  | "authentication"
  | "authorization"
  | "audit"
  | "media"
  | "job"
  | "transfer"
  | "event"
  | "webhook"
  | "schedule"
  | "auth-provider"
  | "session";

export type LinkableObjectType = "tenant" | "device" | "rack" | "site";

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "active" | "suspended" | "retired";
}

export interface TagDefinition {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly colorToken: string;
}

export interface StatusDefinition {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly scope: StatusScope;
}

export interface ObjectAssociationReference {
  readonly objectType: LinkableObjectType;
  readonly objectId: string;
}

export const defaultTenantStatuses: readonly StatusDefinition[] = [
  { id: "tenant-active", slug: "active", label: "Active", scope: "tenant" },
  { id: "tenant-suspended", slug: "suspended", label: "Suspended", scope: "tenant" },
  { id: "tenant-retired", slug: "retired", label: "Retired", scope: "tenant" }
] as const;

export function isLinkableObjectType(value: string): value is LinkableObjectType {
  return value === "tenant" || value === "device" || value === "rack" || value === "site";
}

export function createTenantDirectory(tenants: readonly Tenant[]) {
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

export * from "./search/index.js";
export {
  createPermissionIndex,
  createProviderRoleMappingId,
  createRoleAssignmentId,
  createRoleIndex,
  defaultScopedPermissions as defaultCorePermissions,
  defaultScopedRoles as defaultCoreRoles,
  evaluateScopedAccess,
  expandRoleAssignmentsToGrants,
  resolveProviderRoleAssignments
} from "./rbac/index.js";
export type {
  ExternalRoleMappingInput,
  PermissionAction,
  PermissionDefinition,
  PermissionGrant,
  ProviderClaimType,
  ProviderRoleMapping,
  RbacResource,
  RbacScopeType,
  RoleAssignment,
  RoleDefinition,
  ScopedAccessContext,
  ScopedAccessDecision
} from "./rbac/index.js";
