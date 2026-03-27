export type StatusScope =
  | "tenant"
  | "tag"
  | "authentication"
  | "authorization"
  | "audit"
  | "media";

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
  { id: "tag:assign", resource: "tag", action: "assign" },
  { id: "status:read", resource: "status", action: "read" },
  { id: "audit:read", resource: "audit", action: "read" },
  { id: "media:read", resource: "media", action: "read" },
  { id: "media:write", resource: "media", action: "write" },
  { id: "media:delete", resource: "media", action: "delete" },
  { id: "media:assign", resource: "media", action: "assign" }
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
    permissionIds: ["tenant:read", "status:read", "audit:read", "media:read"]
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
