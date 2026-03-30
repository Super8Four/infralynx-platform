export type PermissionAction = "read" | "write" | "delete" | "execute" | "assign";

export type RbacResource =
  | "tenant"
  | "user"
  | "role"
  | "permission"
  | "auth-provider"
  | "session"
  | "status"
  | "audit"
  | "media"
  | "job"
  | "transfer"
  | "event"
  | "webhook"
  | "schedule"
  | "backup"
  | "workflow"
  | "tag"
  | "site"
  | "rack"
  | "device"
  | "prefix"
  | "ip-address"
  | "vrf"
  | "interface"
  | "connection"
  | "rbac";

export type RbacScopeType = "global" | "tenant" | "site" | "device";

export type ProviderClaimType = "ldap-group" | "oidc-claim" | "saml-attribute";

export interface PermissionDefinition {
  readonly id: string;
  readonly resource: RbacResource;
  readonly action: PermissionAction;
  readonly scopeTypes: readonly RbacScopeType[];
}

export interface RoleDefinition {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly permissionIds: readonly string[];
}

export interface RoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly roleId: string;
  readonly scopeType: RbacScopeType;
  readonly scopeId: string | null;
  readonly createdAt: string;
}

export interface ProviderRoleMapping {
  readonly id: string;
  readonly providerId: string;
  readonly claimType: ProviderClaimType;
  readonly claimKey: string;
  readonly claimValue: string;
  readonly roleId: string;
  readonly scopeType: RbacScopeType;
  readonly scopeId: string | null;
  readonly createdAt: string;
}

export interface PermissionGrant {
  readonly permissionId: string;
  readonly roleId: string;
  readonly scopeType: RbacScopeType;
  readonly scopeId: string | null;
}

export interface ScopedAccessContext {
  readonly tenantId?: string | null;
  readonly siteId?: string | null;
  readonly deviceId?: string | null;
}

export interface ScopedAccessDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly grants: readonly PermissionGrant[];
}

export interface ExternalRoleMappingInput {
  readonly groups?: readonly string[];
  readonly claims?: Record<string, unknown>;
}

export const defaultScopedPermissions: readonly PermissionDefinition[] = [
  { id: "tenant:read", resource: "tenant", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "tenant:write", resource: "tenant", action: "write", scopeTypes: ["global"] },
  { id: "user:read", resource: "user", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "user:write", resource: "user", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "rbac:read", resource: "rbac", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "rbac:write", resource: "rbac", action: "write", scopeTypes: ["global"] },
  { id: "role:read", resource: "role", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "role:write", resource: "role", action: "write", scopeTypes: ["global"] },
  { id: "permission:read", resource: "permission", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "auth:read", resource: "auth-provider", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "auth:write", resource: "auth-provider", action: "write", scopeTypes: ["global"] },
  { id: "auth:test", resource: "auth-provider", action: "execute", scopeTypes: ["global"] },
  { id: "session:read", resource: "session", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "session:write", resource: "session", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "tag:assign", resource: "tag", action: "assign", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "status:read", resource: "status", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "audit:read", resource: "audit", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "media:read", resource: "media", action: "read", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "media:write", resource: "media", action: "write", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "media:delete", resource: "media", action: "delete", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "media:assign", resource: "media", action: "assign", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "job:read", resource: "job", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "job:write", resource: "job", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "job:execute", resource: "job", action: "execute", scopeTypes: ["global"] },
  { id: "transfer:read", resource: "transfer", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "transfer:write", resource: "transfer", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "event:read", resource: "event", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "webhook:read", resource: "webhook", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "webhook:write", resource: "webhook", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "webhook:delete", resource: "webhook", action: "delete", scopeTypes: ["global", "tenant"] },
  { id: "webhook:deliver", resource: "webhook", action: "execute", scopeTypes: ["global"] },
  { id: "schedule:read", resource: "schedule", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "schedule:write", resource: "schedule", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "schedule:execute", resource: "schedule", action: "execute", scopeTypes: ["global"] },
  { id: "backup:read", resource: "backup", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "backup:write", resource: "backup", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "backup:restore", resource: "backup", action: "execute", scopeTypes: ["global"] },
  { id: "workflow:read", resource: "workflow", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "workflow:write", resource: "workflow", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "workflow:approve", resource: "workflow", action: "assign", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "site:read", resource: "site", action: "read", scopeTypes: ["global", "tenant", "site"] },
  { id: "site:write", resource: "site", action: "write", scopeTypes: ["global", "tenant", "site"] },
  { id: "site:delete", resource: "site", action: "delete", scopeTypes: ["global", "tenant", "site"] },
  { id: "rack:read", resource: "rack", action: "read", scopeTypes: ["global", "tenant", "site"] },
  { id: "rack:write", resource: "rack", action: "write", scopeTypes: ["global", "tenant", "site"] },
  { id: "rack:delete", resource: "rack", action: "delete", scopeTypes: ["global", "tenant", "site"] },
  { id: "device:read", resource: "device", action: "read", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "device:write", resource: "device", action: "write", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "device:delete", resource: "device", action: "delete", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "prefix:read", resource: "prefix", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "prefix:write", resource: "prefix", action: "write", scopeTypes: ["global", "tenant"] },
  { id: "prefix:delete", resource: "prefix", action: "delete", scopeTypes: ["global", "tenant"] },
  { id: "ip-address:read", resource: "ip-address", action: "read", scopeTypes: ["global", "tenant", "device"] },
  { id: "ip-address:write", resource: "ip-address", action: "write", scopeTypes: ["global", "tenant", "device"] },
  { id: "ip-address:delete", resource: "ip-address", action: "delete", scopeTypes: ["global", "tenant", "device"] },
  { id: "vrf:read", resource: "vrf", action: "read", scopeTypes: ["global", "tenant"] },
  { id: "interface:read", resource: "interface", action: "read", scopeTypes: ["global", "tenant", "site", "device"] },
  { id: "connection:read", resource: "connection", action: "read", scopeTypes: ["global", "tenant", "site", "device"] }
] as const;

export const defaultScopedRoles: readonly RoleDefinition[] = [
  {
    id: "core-platform-admin",
    slug: "platform-admin",
    name: "Platform Administrator",
    description: "Global administrative access across all current InfraLynx services.",
    permissionIds: defaultScopedPermissions.map((permission) => permission.id)
  },
  {
    id: "core-tenant-operator",
    slug: "tenant-operator",
    name: "Tenant Operator",
    description: "Tenant-scoped operational access for current CRUD and operations surfaces.",
    permissionIds: [
      "tenant:read",
      "user:read",
      "rbac:read",
      "site:read",
      "site:write",
      "rack:read",
      "rack:write",
      "device:read",
      "device:write",
      "prefix:read",
      "prefix:write",
      "ip-address:read",
      "ip-address:write",
      "vrf:read",
      "interface:read",
      "connection:read",
      "job:read",
      "job:write",
      "transfer:read",
      "transfer:write",
      "media:read",
      "media:write",
      "webhook:read",
      "schedule:read"
      ,
      "backup:read",
      "backup:write",
      "workflow:read",
      "workflow:write",
      "workflow:approve"
    ]
  },
  {
    id: "core-auditor",
    slug: "auditor",
    name: "Auditor",
    description: "Read-only access for verification, reporting, and compliance.",
    permissionIds: [
      "tenant:read",
      "user:read",
      "rbac:read",
      "role:read",
      "permission:read",
      "auth:read",
      "session:read",
      "status:read",
      "audit:read",
      "media:read",
      "job:read",
      "transfer:read",
      "event:read",
      "webhook:read",
      "schedule:read",
      "backup:read",
      "workflow:read",
      "site:read",
      "rack:read",
      "device:read",
      "prefix:read",
      "ip-address:read",
      "vrf:read",
      "interface:read",
      "connection:read"
    ]
  }
] as const;

export function createPermissionIndex(permissions: readonly PermissionDefinition[]) {
  return new Map(permissions.map((permission) => [permission.id, permission]));
}

export function createRoleIndex(roles: readonly RoleDefinition[]) {
  return new Map(roles.map((role) => [role.id, role]));
}

export function createRoleAssignmentId(input: {
  readonly userId: string;
  readonly roleId: string;
  readonly scopeType: RbacScopeType;
  readonly scopeId: string | null;
}) {
  return [input.userId, input.roleId, input.scopeType, input.scopeId ?? "global"].join(":");
}

export function createProviderRoleMappingId(input: {
  readonly providerId: string;
  readonly claimType: ProviderClaimType;
  readonly claimKey: string;
  readonly claimValue: string;
  readonly roleId: string;
  readonly scopeType: RbacScopeType;
  readonly scopeId: string | null;
}) {
  return [
    input.providerId,
    input.claimType,
    input.claimKey,
    input.claimValue,
    input.roleId,
    input.scopeType,
    input.scopeId ?? "global"
  ].join(":");
}

export function expandRoleAssignmentsToGrants(
  assignments: readonly RoleAssignment[],
  roles: readonly RoleDefinition[],
  permissions: readonly PermissionDefinition[] = defaultScopedPermissions
): readonly PermissionGrant[] {
  const roleIndex = createRoleIndex(roles);
  const permissionIndex = createPermissionIndex(permissions);
  const grants: PermissionGrant[] = [];

  for (const assignment of assignments) {
    const role = roleIndex.get(assignment.roleId);

    if (!role) {
      continue;
    }

    for (const permissionId of role.permissionIds) {
      const permission = permissionIndex.get(permissionId);

      if (!permission) {
        continue;
      }

      grants.push({
        permissionId: permission.id,
        roleId: role.id,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId
      });
    }
  }

  return grants;
}

function grantMatchesContext(grant: PermissionGrant, context: ScopedAccessContext): boolean {
  if (grant.scopeType === "global") {
    return true;
  }

  if (grant.scopeType === "tenant") {
    return grant.scopeId !== null && grant.scopeId === (context.tenantId ?? null);
  }

  if (grant.scopeType === "site") {
    return grant.scopeId !== null && grant.scopeId === (context.siteId ?? null);
  }

  return grant.scopeId !== null && grant.scopeId === (context.deviceId ?? null);
}

export function evaluateScopedAccess(
  grants: readonly PermissionGrant[],
  permissionId: string,
  context: ScopedAccessContext = {}
): ScopedAccessDecision {
  const matchingGrants = grants.filter((grant) => grant.permissionId === permissionId);

  if (matchingGrants.length === 0) {
    return { allowed: false, reason: "permission not granted to assigned roles", grants: [] };
  }

  const contextualGrants = matchingGrants.filter((grant) => grantMatchesContext(grant, context));

  if (contextualGrants.length === 0) {
    return { allowed: false, reason: "permission granted outside the requested scope", grants: matchingGrants };
  }

  return { allowed: true, reason: "permission granted by assigned role and scope", grants: contextualGrants };
}

function normalizeClaimValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
}

export function resolveProviderRoleAssignments(
  mappings: readonly ProviderRoleMapping[],
  providerId: string,
  externalIdentity: ExternalRoleMappingInput,
  userId: string,
  createdAt = new Date().toISOString()
): readonly RoleAssignment[] {
  const groups = new Set(externalIdentity.groups ?? []);
  const claimValues = externalIdentity.claims ?? {};

  return mappings
    .filter((mapping) => mapping.providerId === providerId)
    .filter((mapping) => {
      if (mapping.claimType === "ldap-group") {
        return groups.has(mapping.claimValue);
      }

      const claimValue = claimValues[mapping.claimKey];
      return normalizeClaimValues(claimValue).includes(mapping.claimValue);
    })
    .map((mapping) => ({
      id: createRoleAssignmentId({
        userId,
        roleId: mapping.roleId,
        scopeType: mapping.scopeType,
        scopeId: mapping.scopeId
      }),
      userId,
      roleId: mapping.roleId,
      scopeType: mapping.scopeType,
      scopeId: mapping.scopeId,
      createdAt
    }));
}
