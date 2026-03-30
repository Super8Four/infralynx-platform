import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createProviderRoleMappingId,
  createRoleAssignmentId,
  defaultCorePermissions,
  defaultCoreRoles,
  expandRoleAssignmentsToGrants,
  type PermissionDefinition,
  type ProviderClaimType,
  type RbacScopeType,
  type RoleDefinition,
  type ScopedAccessContext
} from "../../../../packages/core-domain/dist/index.js";
import {
  createAuthRepository,
  requirePermission,
  resolveRequestAuthIdentity,
  type AuthIdentity,
  type AuthProviderRoleMapping,
  type AuthUserRoleAssignment
} from "../../../../packages/auth-core/dist/index.js";
import { appendAuditRecord } from "../audit/index.js";

const authRootDirectory = resolve(process.cwd(), "runtime-data/auth");
const authStateFilePath = resolve(authRootDirectory, "state.json");
const authMasterKeyPath = resolve(authRootDirectory, "master-key.txt");

mkdirSync(dirname(authStateFilePath), { recursive: true });

const authRepository = createAuthRepository(authStateFilePath, authMasterKeyPath);

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function createHeaderIdentity(request: IncomingMessage): AuthIdentity | null {
  const actorId = request.headers["x-infralynx-actor-id"];
  const roleIdsHeader = request.headers["x-infralynx-role-ids"];
  const tenantIdHeader = request.headers["x-infralynx-tenant-id"];

  if (typeof actorId !== "string" || typeof roleIdsHeader !== "string") {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId: typeof tenantIdHeader === "string" ? tenantIdHeader : "tenant-ops",
    method: "api-token",
    roleIds: roleIdsHeader.split(",").map((value) => value.trim()).filter(Boolean),
    displayName: actorId
  };
}

export async function createRequestIdentity(request: IncomingMessage): Promise<AuthIdentity | null> {
  const bearerIdentity = await resolveRequestAuthIdentity({
    authorizationHeader: typeof request.headers["authorization"] === "string" ? request.headers["authorization"] : undefined,
    repository: authRepository,
    masterKeyPath: authMasterKeyPath
  }).catch(() => null);

  return bearerIdentity ?? createHeaderIdentity(request);
}

function sendForbidden(response: ServerResponse, reason: string, statusCode = 403) {
  sendJson(response, statusCode, {
    error: {
      code: statusCode === 401 ? "unauthorized" : "forbidden",
      message: reason
    }
  });
}

export async function requireApiPermission(
  request: IncomingMessage,
  response: ServerResponse,
  permissionId: string,
  context: ScopedAccessContext = {}
): Promise<AuthIdentity | null> {
  const identity = await createRequestIdentity(request);
  const decision = requirePermission(identity, permissionId, defaultCoreRoles, context);

  if (!decision.allowed) {
    sendForbidden(response, decision.reason, identity ? 403 : 401);
    return null;
  }

  return identity;
}

export function buildPermissionSummary(identity: AuthIdentity | null) {
  if (!identity) {
    return null;
  }

  const assignments =
    identity.assignments && identity.assignments.length > 0
      ? identity.assignments
      : authRepository.listRoleAssignmentsByUser(identity.id).length > 0
        ? authRepository.listRoleAssignmentsByUser(identity.id)
        : identity.roleIds.map((roleId) => ({
            id: createRoleAssignmentId({
              userId: identity.id,
              roleId,
              scopeType: "global",
              scopeId: null
            }),
            userId: identity.id,
            roleId,
            scopeType: "global" as const,
            scopeId: null,
            createdAt: new Date().toISOString()
          }));
  const grants = identity.grants && identity.grants.length > 0 ? identity.grants : expandRoleAssignmentsToGrants(assignments, defaultCoreRoles);

  return {
    identity: {
      id: identity.id,
      subject: identity.subject,
      tenantId: identity.tenantId,
      method: identity.method,
      roleIds: identity.roleIds,
      displayName: identity.displayName ?? null
    },
    permissions: Array.from(new Set(grants.map((grant) => grant.permissionId))).sort(),
    assignments,
    grants
  };
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

async function parseJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readRequestBody(request);

  if (!body.trim()) {
    return {};
  }

  const parsed = JSON.parse(body) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("request body must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asScopeType(value: unknown): RbacScopeType | null {
  if (value === "global" || value === "tenant" || value === "site" || value === "device") {
    return value;
  }

  return null;
}

function asClaimType(value: unknown): ProviderClaimType | null {
  if (value === "ldap-group" || value === "oidc-claim" || value === "saml-attribute") {
    return value;
  }

  return null;
}

function validateRoleAssignmentInput(payload: Record<string, unknown>) {
  const userId = asString(payload["userId"]);
  const roleId = asString(payload["roleId"]);
  const scopeType = asScopeType(payload["scopeType"]) ?? "global";
  const scopeId = asString(payload["scopeId"]);
  const errors: string[] = [];

  if (!userId || !authRepository.getUserById(userId)) {
    errors.push("userId must reference an existing user");
  }

  if (!roleId || !defaultCoreRoles.some((role) => role.id === roleId)) {
    errors.push("roleId must reference an existing role");
  }

  if (scopeType !== "global" && !scopeId) {
    errors.push("scopeId is required for tenant, site, or device scope");
  }

  return {
    valid: errors.length === 0,
    errors,
    assignment: userId && roleId
      ? ({
          id: createRoleAssignmentId({
            userId,
            roleId,
            scopeType,
            scopeId: scopeType === "global" ? null : scopeId
          }),
          userId,
          roleId,
          scopeType,
          scopeId: scopeType === "global" ? null : scopeId,
          createdAt: new Date().toISOString()
        } satisfies AuthUserRoleAssignment)
      : null
  };
}

function validateProviderRoleMappingInput(payload: Record<string, unknown>) {
  const providerId = asString(payload["providerId"]);
  const claimType = asClaimType(payload["claimType"]);
  const claimKey = asString(payload["claimKey"]);
  const claimValue = asString(payload["claimValue"]);
  const roleId = asString(payload["roleId"]);
  const scopeType = asScopeType(payload["scopeType"]) ?? "global";
  const scopeId = asString(payload["scopeId"]);
  const errors: string[] = [];

  if (!providerId || !authRepository.getProviderById(providerId)) {
    errors.push("providerId must reference an existing provider");
  }

  if (!claimType) {
    errors.push("claimType must be ldap-group, oidc-claim, or saml-attribute");
  }

  if (!claimKey) {
    errors.push("claimKey is required");
  }

  if (!claimValue) {
    errors.push("claimValue is required");
  }

  if (!roleId || !defaultCoreRoles.some((role) => role.id === roleId)) {
    errors.push("roleId must reference an existing role");
  }

  if (scopeType !== "global" && !scopeId) {
    errors.push("scopeId is required for tenant, site, or device scope");
  }

  return {
    valid: errors.length === 0,
    errors,
    mapping: providerId && claimType && claimKey && claimValue && roleId
      ? ({
          id: createProviderRoleMappingId({
            providerId,
            claimType,
            claimKey,
            claimValue,
            roleId,
            scopeType,
            scopeId: scopeType === "global" ? null : scopeId
          }),
          providerId,
          claimType,
          claimKey,
          claimValue,
          roleId,
          scopeType,
          scopeId: scopeType === "global" ? null : scopeId,
          createdAt: new Date().toISOString()
        } satisfies AuthProviderRoleMapping)
      : null
  };
}

function createRbacResponse(identity: AuthIdentity | null) {
  return {
    summary: buildPermissionSummary(identity),
    roles: defaultCoreRoles as readonly RoleDefinition[],
    permissions: defaultCorePermissions as readonly PermissionDefinition[],
    assignments: authRepository.listRoleAssignments(),
    providerMappings: authRepository.listProviderRoleMappings(),
    users: authRepository.listUsers().map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      status: user.status
    })),
    providers: authRepository.listProviders()
  };
}

export async function handleRbacApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/rbac")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (requestUrl.pathname === "/api/rbac" && request.method === "GET") {
    const identity = await requireApiPermission(request, response, "rbac:read");

    if (!identity) {
      return true;
    }

    sendJson(response, 200, createRbacResponse(identity));
    return true;
  }

  if (requestUrl.pathname === "/api/rbac/summary" && request.method === "GET") {
    const identity = await createRequestIdentity(request);

    if (!identity) {
      sendForbidden(response, "authentication is required", 401);
      return true;
    }

    sendJson(response, 200, buildPermissionSummary(identity));
    return true;
  }

  if (requestUrl.pathname === "/api/rbac/assignments" && request.method === "POST") {
    const identity = await requireApiPermission(request, response, "rbac:write");

    if (!identity) {
      return true;
    }

    try {
      const payload = await parseJsonBody(request);
      const validation = validateRoleAssignmentInput(payload);

      if (!validation.valid || !validation.assignment) {
        sendJson(response, 400, { error: { code: "validation_failed", message: validation.errors.join("; ") } });
        return true;
      }

      const assignment = authRepository.saveRoleAssignment(validation.assignment);
      appendAuditRecord({
        userId: identity.id,
        actorType: "user",
        tenantId: identity.tenantId,
        action: "rbac.role-assignment.created",
        objectType: "role-assignment",
        objectId: assignment.id,
        metadata: {
          roleId: assignment.roleId,
          userId: assignment.userId,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId
        }
      });
      sendJson(response, 200, { assignment, summary: createRbacResponse(identity) });
      return true;
    } catch (error) {
      sendJson(response, 400, { error: { code: "invalid_json", message: error instanceof Error ? error.message : "invalid request body" } });
      return true;
    }
  }

  const assignmentMatch = requestUrl.pathname.match(/^\/api\/rbac\/assignments\/([^/]+)$/);
  if (assignmentMatch && request.method === "DELETE") {
    const identity = await requireApiPermission(request, response, "rbac:write");

    if (!identity) {
      return true;
    }

    const deleted = authRepository.deleteRoleAssignment(assignmentMatch[1]);

    if (!deleted) {
      sendJson(response, 404, { error: { code: "not_found", message: "role assignment was not found" } });
      return true;
    }

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "rbac.role-assignment.deleted",
      objectType: "role-assignment",
      objectId: assignmentMatch[1],
      metadata: {}
    });
    sendJson(response, 200, { deletedId: assignmentMatch[1], summary: createRbacResponse(identity) });
    return true;
  }

  if (requestUrl.pathname === "/api/rbac/provider-mappings" && request.method === "POST") {
    const identity = await requireApiPermission(request, response, "rbac:write");

    if (!identity) {
      return true;
    }

    try {
      const payload = await parseJsonBody(request);
      const validation = validateProviderRoleMappingInput(payload);

      if (!validation.valid || !validation.mapping) {
        sendJson(response, 400, { error: { code: "validation_failed", message: validation.errors.join("; ") } });
        return true;
      }

      const mapping = authRepository.saveProviderRoleMapping(validation.mapping);
      appendAuditRecord({
        userId: identity.id,
        actorType: "user",
        tenantId: identity.tenantId,
        action: "rbac.provider-role-mapping.created",
        objectType: "provider-role-mapping",
        objectId: mapping.id,
        metadata: {
          providerId: mapping.providerId,
          roleId: mapping.roleId,
          claimType: mapping.claimType,
          claimKey: mapping.claimKey,
          claimValue: mapping.claimValue
        }
      });
      sendJson(response, 200, { mapping, summary: createRbacResponse(identity) });
      return true;
    } catch (error) {
      sendJson(response, 400, { error: { code: "invalid_json", message: error instanceof Error ? error.message : "invalid request body" } });
      return true;
    }
  }

  const mappingMatch = requestUrl.pathname.match(/^\/api\/rbac\/provider-mappings\/([^/]+)$/);
  if (mappingMatch && request.method === "DELETE") {
    const identity = await requireApiPermission(request, response, "rbac:write");

    if (!identity) {
      return true;
    }

    const deleted = authRepository.deleteProviderRoleMapping(mappingMatch[1]);

    if (!deleted) {
      sendJson(response, 404, { error: { code: "not_found", message: "provider role mapping was not found" } });
      return true;
    }

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "rbac.provider-role-mapping.deleted",
      objectType: "provider-role-mapping",
      objectId: mappingMatch[1],
      metadata: {}
    });
    sendJson(response, 200, { deletedId: mappingMatch[1], summary: createRbacResponse(identity) });
    return true;
  }

  return false;
}
