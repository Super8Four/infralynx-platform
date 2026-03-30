import { requestJson } from "./api-client";
import type { AuthProviderSummary } from "./auth";

export interface RbacPermission {
  readonly id: string;
  readonly resource: string;
  readonly action: string;
  readonly scopeTypes: readonly string[];
}

export interface RbacRole {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly permissionIds: readonly string[];
}

export interface RbacRoleAssignment {
  readonly id: string;
  readonly userId: string;
  readonly roleId: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly createdAt: string;
}

export interface ProviderRoleMapping {
  readonly id: string;
  readonly providerId: string;
  readonly claimType: string;
  readonly claimKey: string;
  readonly claimValue: string;
  readonly roleId: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly createdAt: string;
}

export interface RbacUserSummary {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly tenantId: string;
  readonly roleIds: readonly string[];
  readonly status: string;
}

export interface RbacSummaryResponse {
  readonly summary: {
    readonly identity: {
      readonly id: string;
      readonly subject: string;
      readonly tenantId: string;
      readonly method: string;
      readonly roleIds: readonly string[];
      readonly displayName: string | null;
    };
    readonly permissions: readonly string[];
    readonly assignments: readonly RbacRoleAssignment[];
    readonly grants: readonly {
      readonly permissionId: string;
      readonly roleId: string;
      readonly scopeType: string;
      readonly scopeId: string | null;
    }[];
  } | null;
  readonly roles: readonly RbacRole[];
  readonly permissions: readonly RbacPermission[];
  readonly assignments: readonly RbacRoleAssignment[];
  readonly providerMappings: readonly ProviderRoleMapping[];
  readonly users: readonly RbacUserSummary[];
  readonly providers: readonly AuthProviderSummary[];
}

export async function fetchRbacSummary() {
  return requestJson<RbacSummaryResponse>("/api/rbac");
}

export async function createRoleAssignment(input: {
  readonly userId: string;
  readonly roleId: string;
  readonly scopeType: string;
  readonly scopeId?: string | null;
}) {
  return requestJson<{ readonly assignment: RbacRoleAssignment; readonly summary: RbacSummaryResponse }>("/api/rbac/assignments", {
    method: "POST",
    body: input
  });
}

export async function deleteRoleAssignment(assignmentId: string) {
  return requestJson<{ readonly deletedId: string; readonly summary: RbacSummaryResponse }>(`/api/rbac/assignments/${assignmentId}`, {
    method: "DELETE"
  });
}

export async function createProviderRoleMapping(input: {
  readonly providerId: string;
  readonly claimType: string;
  readonly claimKey: string;
  readonly claimValue: string;
  readonly roleId: string;
  readonly scopeType: string;
  readonly scopeId?: string | null;
}) {
  return requestJson<{ readonly mapping: ProviderRoleMapping; readonly summary: RbacSummaryResponse }>(
    "/api/rbac/provider-mappings",
    {
      method: "POST",
      body: input
    }
  );
}

export async function deleteProviderRoleMapping(mappingId: string) {
  return requestJson<{ readonly deletedId: string; readonly summary: RbacSummaryResponse }>(`/api/rbac/provider-mappings/${mappingId}`, {
    method: "DELETE"
  });
}
