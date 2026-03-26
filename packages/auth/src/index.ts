import type { RoleDefinition } from "../../core-domain/dist/index.js";

export type AuthenticationMethod = "password" | "sso" | "api-token" | "service-account";

export interface AuthIdentity {
  readonly id: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly method: AuthenticationMethod;
  readonly roleIds: readonly string[];
}

export interface AuthSession {
  readonly id: string;
  readonly identityId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export function resolveAccessDecision(
  identity: AuthIdentity,
  roles: readonly RoleDefinition[],
  permissionId: string
): AccessDecision {
  const grantedPermissions = new Set(
    roles
      .filter((role) => identity.roleIds.includes(role.id))
      .flatMap((role) => role.permissionIds)
  );

  if (grantedPermissions.has(permissionId)) {
    return { allowed: true, reason: "permission granted by assigned role" };
  }

  return { allowed: false, reason: "permission not granted to assigned roles" };
}

export function createSession(identityId: string, issuedAt: string, ttlMinutes: number): AuthSession {
  const issuedAtDate = new Date(issuedAt);
  const expiresAtDate = new Date(issuedAtDate.getTime() + ttlMinutes * 60_000);

  return {
    id: `${identityId}:${issuedAtDate.toISOString()}`,
    identityId,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString()
  };
}
