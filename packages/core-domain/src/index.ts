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

export interface PermissionDefinition {
  readonly id: string;
  readonly resource: string;
  readonly action: "read" | "write" | "delete" | "execute" | "assign";
}

export interface RoleDefinition {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
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

export const defaultCorePermissions: readonly PermissionDefinition[] = [
  { id: "tenant:read", resource: "tenant", action: "read" },
  { id: "tenant:write", resource: "tenant", action: "write" },
  { id: "auth:read", resource: "auth-provider", action: "read" },
  { id: "auth:write", resource: "auth-provider", action: "write" },
  { id: "auth:test", resource: "auth-provider", action: "execute" },
  { id: "session:read", resource: "session", action: "read" },
  { id: "session:write", resource: "session", action: "write" },
  { id: "tag:assign", resource: "tag", action: "assign" },
  { id: "status:read", resource: "status", action: "read" },
  { id: "audit:read", resource: "audit", action: "read" },
  { id: "media:read", resource: "media", action: "read" },
  { id: "media:write", resource: "media", action: "write" },
  { id: "media:delete", resource: "media", action: "delete" },
  { id: "media:assign", resource: "media", action: "assign" },
  { id: "job:read", resource: "job", action: "read" },
  { id: "job:write", resource: "job", action: "write" },
  { id: "job:execute", resource: "job", action: "execute" },
  { id: "transfer:read", resource: "transfer", action: "read" },
  { id: "transfer:write", resource: "transfer", action: "write" },
  { id: "event:read", resource: "event", action: "read" },
  { id: "webhook:read", resource: "webhook", action: "read" },
  { id: "webhook:write", resource: "webhook", action: "write" },
  { id: "webhook:delete", resource: "webhook", action: "delete" },
  { id: "webhook:deliver", resource: "webhook", action: "execute" },
  { id: "schedule:read", resource: "schedule", action: "read" },
  { id: "schedule:write", resource: "schedule", action: "write" },
  { id: "schedule:execute", resource: "schedule", action: "execute" }
] as const;

export const defaultCoreRoles: readonly RoleDefinition[] = [
  {
    id: "core-platform-admin",
    slug: "platform-admin",
    name: "Platform Administrator",
    permissionIds: defaultCorePermissions.map((permission) => permission.id)
  },
  {
    id: "core-auditor",
    slug: "auditor",
    name: "Auditor",
    permissionIds: [
      "tenant:read",
      "auth:read",
      "session:read",
      "status:read",
      "audit:read",
      "media:read",
      "job:read",
      "transfer:read",
      "event:read",
      "webhook:read",
      "schedule:read"
    ]
  }
] as const;

export function isLinkableObjectType(value: string): value is LinkableObjectType {
  return value === "tenant" || value === "device" || value === "rack" || value === "site";
}

export function createTenantDirectory(tenants: readonly Tenant[]) {
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

export function createRoleIndex(roles: readonly RoleDefinition[]) {
  return new Map(roles.map((role) => [role.id, role]));
}

export * from "./search/index.js";
