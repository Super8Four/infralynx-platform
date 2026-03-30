import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildLoginFailureRedirect,
  buildLoginSuccessRedirect,
  createAuthRepository,
  issueSessionTokens,
  mapExternalIdentityToUser,
  normalizeProviderConfig,
  requirePermission,
  validateProviderInput,
  type AuthIdentity,
  type AuthProviderType,
  type OidcAuthConfig,
  type SamlAuthConfig
} from "../../../../packages/auth-core/dist/index.js";
import { authenticateLocalCredentials } from "../../../../packages/auth-providers/local/dist/index.js";
import {
  authenticateLdapCredentials,
  testLdapProvider
} from "../../../../packages/auth-providers/ldap/dist/index.js";
import {
  buildOidcAuthorizationRedirect,
  completeOidcAuthorization,
  testOidcProvider
} from "../../../../packages/auth-providers/oidc/dist/index.js";
import {
  buildSamlAuthorizationRedirect,
  completeSamlAuthorization,
  testSamlProvider
} from "../../../../packages/auth-providers/saml/dist/index.js";
import { appendAuditRecord } from "../audit/index.js";
import {
  invalidateAuthCache,
  resolveCachedAuthIdentity,
  sendCachedJsonResponse
} from "../cache/index.js";
import { buildPermissionSummary } from "../rbac/index.js";

const authRootDirectory = resolve(process.cwd(), "runtime-data/auth");
const authStateFilePath = resolve(authRootDirectory, "state.json");
const authMasterKeyPath = resolve(authRootDirectory, "master-key.txt");

mkdirSync(dirname(authStateFilePath), { recursive: true });

const authRepository = createAuthRepository(authStateFilePath, authMasterKeyPath);
const maskedSecretValue = "••••••••";

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
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

async function createRequestIdentity(request: IncomingMessage): Promise<AuthIdentity | null> {
  const bearerIdentity = await resolveCachedAuthIdentity({
    request,
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

async function requireAuthPermission(
  request: IncomingMessage,
  response: ServerResponse,
  permissionId: string
): Promise<AuthIdentity | null> {
  const identity = await createRequestIdentity(request);
  const decision = requirePermission(identity, permissionId);

  if (!decision.allowed) {
    sendForbidden(response, decision.reason, identity ? 403 : 401);
    return null;
  }

  return identity;
}

function mapSessionResponse(tokens: Awaited<ReturnType<typeof issueSessionTokens>>) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    session: {
      id: tokens.session.id,
      userId: tokens.session.userId,
      providerId: tokens.session.providerId,
      tenantId: tokens.session.tenantId,
      roleIds: tokens.session.roleIds,
      displayName: tokens.session.displayName,
      accessExpiresAt: tokens.session.accessExpiresAt,
      refreshExpiresAt: tokens.session.refreshExpiresAt
    }
  };
}

async function handleLocalLogin(request: IncomingMessage, response: ServerResponse) {
  let payload: Record<string, unknown>;

  try {
    payload = await parseJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return;
  }

  try {
    const result = authenticateLocalCredentials(authRepository, {
      username: String(payload["username"] ?? ""),
      password: String(payload["password"] ?? "")
    });
    const session = authRepository.createSessionRecord({
      userId: result.user.id,
      providerId: result.provider.id,
      subject: result.user.username,
      tenantId: result.user.tenantId,
      roleIds: result.user.roleIds,
      displayName: result.user.displayName
    });
    const tokens = await issueSessionTokens(authRepository, session, authMasterKeyPath);

    authRepository.appendLog({
      level: "info",
      action: "auth.login.local",
      actorId: result.user.id,
      providerId: result.provider.id,
      sessionId: session.id,
      message: "local login succeeded"
    });
    appendAuditRecord({
      userId: result.user.id,
      actorType: "user",
      tenantId: result.user.tenantId,
      action: "auth.login.local.succeeded",
      objectType: "login",
      objectId: session.id,
      metadata: {
        providerId: result.provider.id,
        username: result.user.username
      }
    });

    await invalidateAuthCache();
    sendJson(response, 200, mapSessionResponse(tokens));
  } catch (error) {
    authRepository.appendLog({
      level: "warn",
      action: "auth.login.local.failed",
      actorId: null,
      providerId: "provider-local",
      sessionId: null,
      message: error instanceof Error ? error.message : "local login failed"
    });
    appendAuditRecord({
      userId: null,
      actorType: "system",
      tenantId: null,
      action: "auth.login.local.failed",
      objectType: "login",
      objectId: null,
      metadata: {
        reason: error instanceof Error ? error.message : "local login failed"
      }
    });
    sendForbidden(response, "local login failed", 401);
  }
}

async function handleLdapLogin(request: IncomingMessage, response: ServerResponse) {
  let payload: Record<string, unknown>;

  try {
    payload = await parseJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return;
  }

  const providerId = String(payload["providerId"] ?? "");
  const provider = authRepository.getProviderRecord(providerId);

  if (!provider || provider.type !== "ldap" || !provider.enabled) {
    sendForbidden(response, "ldap provider is not available", 401);
    return;
  }

  try {
    const ldapConfig = authRepository.getProviderConfig(providerId);
    const ldapIdentity = await authenticateLdapCredentials(
      ldapConfig as never,
      String(payload["username"] ?? ""),
      String(payload["password"] ?? "")
    );
    const mapped = mapExternalIdentityToUser(authRepository, {
      providerId,
      externalId: ldapIdentity.externalId,
      username: ldapIdentity.username,
      displayName: ldapIdentity.displayName,
      externalRoles: {
        groups: "groups" in ldapIdentity && Array.isArray(ldapIdentity.groups) ? ldapIdentity.groups : []
      }
    });
    const session = authRepository.createSessionRecord({
      userId: mapped.user.id,
      providerId,
      subject: ldapIdentity.username,
      tenantId: mapped.user.tenantId,
      roleIds: mapped.user.roleIds,
      displayName: mapped.user.displayName
    });
    const tokens = await issueSessionTokens(authRepository, session, authMasterKeyPath);

    authRepository.appendLog({
      level: "info",
      action: "auth.login.ldap",
      actorId: mapped.user.id,
      providerId,
      sessionId: session.id,
      message: "ldap login succeeded"
    });
    appendAuditRecord({
      userId: mapped.user.id,
      actorType: "user",
      tenantId: mapped.user.tenantId,
      action: "auth.login.ldap.succeeded",
      objectType: "login",
      objectId: session.id,
      metadata: {
        providerId,
        externalId: ldapIdentity.externalId
      }
    });

    await invalidateAuthCache();
    sendJson(response, 200, mapSessionResponse(tokens));
  } catch (error) {
    authRepository.appendLog({
      level: "warn",
      action: "auth.login.ldap.failed",
      actorId: null,
      providerId,
      sessionId: null,
      message: error instanceof Error ? error.message : "ldap login failed"
    });
    appendAuditRecord({
      userId: null,
      actorType: "system",
      tenantId: null,
      action: "auth.login.ldap.failed",
      objectType: "login",
      objectId: null,
      metadata: {
        providerId,
        reason: error instanceof Error ? error.message : "ldap login failed"
      }
    });
    sendForbidden(response, "ldap login failed", 401);
  }
}

async function handleOidcStart(request: IncomingMessage, response: ServerResponse) {
  const payload: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const providerId = String(payload["providerId"] ?? "");
  const redirectBaseUrl = String(payload["redirectBaseUrl"] ?? "http://localhost:5173/");
  const provider = authRepository.getProviderRecord(providerId);

  if (!provider || provider.type !== "oidc" || !provider.enabled) {
    sendJson(response, 404, {
      error: {
        code: "provider_not_found",
        message: "oidc provider is not available"
      }
    });
    return;
  }

  try {
    const provisionalState = `transaction-${randomUUID()}`;
    const { redirectUrl, codeVerifier } = await buildOidcAuthorizationRedirect(
      authRepository.getProviderConfig<OidcAuthConfig>(providerId),
      provisionalState
    );
    authRepository.createTransaction({
      id: provisionalState,
      providerId,
      type: "oidc",
      redirectBaseUrl,
      codeVerifier,
      expectedState: provisionalState
    });

    sendJson(response, 200, {
      redirectUrl,
      state: provisionalState
    });
  } catch (error) {
    sendJson(response, 500, {
      error: {
        code: "oidc_start_failed",
        message: error instanceof Error ? error.message : "oidc start failed"
      }
    });
  }
}

function createRedirectResponse(response: ServerResponse, location: string) {
  response.writeHead(302, { Location: location });
  response.end();
}

async function handleOidcCallback(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const state = requestUrl.searchParams.get("state");

  if (!state) {
    sendJson(response, 400, {
      error: {
        code: "missing_state",
        message: "oidc callback did not include state"
      }
    });
    return;
  }

  const transaction = authRepository.consumeTransaction(state);

  if (!transaction || transaction.type !== "oidc" || !transaction.codeVerifier || !transaction.expectedState) {
    sendJson(response, 400, {
      error: {
        code: "invalid_state",
        message: "oidc transaction state is invalid or expired"
      }
    });
    return;
  }

  try {
    const identity = await completeOidcAuthorization(
      authRepository.getProviderConfig<OidcAuthConfig>(transaction.providerId),
      requestUrl,
      {
        codeVerifier: transaction.codeVerifier,
        expectedState: transaction.expectedState
      }
    );
    const mapped = mapExternalIdentityToUser(authRepository, {
      providerId: transaction.providerId,
      externalId: identity.externalId,
      username: identity.username,
      displayName: identity.displayName,
      externalRoles: {
        claims: "claims" in identity && identity.claims && typeof identity.claims === "object" ? identity.claims as Record<string, unknown> : {},
        groups: "groups" in identity && Array.isArray(identity.groups) ? identity.groups : []
      }
    });
    const session = authRepository.createSessionRecord({
      userId: mapped.user.id,
      providerId: transaction.providerId,
      subject: identity.username,
      tenantId: mapped.user.tenantId,
      roleIds: mapped.user.roleIds,
      displayName: mapped.user.displayName
    });
    const tokens = await issueSessionTokens(authRepository, session, authMasterKeyPath);
    appendAuditRecord({
      userId: mapped.user.id,
      actorType: "user",
      tenantId: mapped.user.tenantId,
      action: "auth.login.oidc.succeeded",
      objectType: "login",
      objectId: session.id,
      metadata: {
        providerId: transaction.providerId,
        externalId: identity.externalId
      }
    });

    await invalidateAuthCache();
    createRedirectResponse(response, buildLoginSuccessRedirect(transaction.redirectBaseUrl, tokens));
  } catch (error) {
    appendAuditRecord({
      userId: null,
      actorType: "system",
      tenantId: null,
      action: "auth.login.oidc.failed",
      objectType: "login",
      objectId: transaction.id,
      metadata: {
        providerId: transaction.providerId,
        reason: error instanceof Error ? error.message : "oidc login failed"
      }
    });
    createRedirectResponse(
      response,
      buildLoginFailureRedirect(
        transaction.redirectBaseUrl,
        error instanceof Error ? error.message : "oidc login failed"
      )
    );
  }
}

async function handleSamlStart(request: IncomingMessage, response: ServerResponse) {
  const payload: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const providerId = String(payload["providerId"] ?? "");
  const redirectBaseUrl = String(payload["redirectBaseUrl"] ?? "http://localhost:5173/");
  const provider = authRepository.getProviderRecord(providerId);

  if (!provider || provider.type !== "saml" || !provider.enabled) {
    sendJson(response, 404, {
      error: {
        code: "provider_not_found",
        message: "saml provider is not available"
      }
    });
    return;
  }

  try {
    const transaction = authRepository.createTransaction({
      providerId,
      type: "saml",
      redirectBaseUrl
    });
    const { redirectUrl } = await buildSamlAuthorizationRedirect(
      authRepository.getProviderConfig<SamlAuthConfig>(providerId),
      transaction.id
    );

    sendJson(response, 200, {
      redirectUrl,
      relayState: transaction.id
    });
  } catch (error) {
    sendJson(response, 500, {
      error: {
        code: "saml_start_failed",
        message: error instanceof Error ? error.message : "saml start failed"
      }
    });
  }
}

async function handleSamlCallback(request: IncomingMessage, response: ServerResponse) {
  const payload: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const relayState = typeof payload["RelayState"] === "string" ? payload["RelayState"] : null;
  const samlResponse = typeof payload["SAMLResponse"] === "string" ? payload["SAMLResponse"] : null;

  if (!relayState || !samlResponse) {
    sendJson(response, 400, {
      error: {
        code: "invalid_saml_payload",
        message: "saml callback requires RelayState and SAMLResponse"
      }
    });
    return;
  }

  const transaction = authRepository.consumeTransaction(relayState);

  if (!transaction || transaction.type !== "saml") {
    sendJson(response, 400, {
      error: {
        code: "invalid_relay_state",
        message: "saml relay state is invalid or expired"
      }
    });
    return;
  }

  try {
    const identity = await completeSamlAuthorization(
      authRepository.getProviderConfig<SamlAuthConfig>(transaction.providerId),
      samlResponse
    );
    const mapped = mapExternalIdentityToUser(authRepository, {
      providerId: transaction.providerId,
      externalId: identity.externalId,
      username: identity.username,
      displayName: identity.displayName,
      externalRoles: {
        claims: "claims" in identity && identity.claims && typeof identity.claims === "object" ? identity.claims as Record<string, unknown> : {},
        groups: "groups" in identity && Array.isArray(identity.groups) ? identity.groups : []
      }
    });
    const session = authRepository.createSessionRecord({
      userId: mapped.user.id,
      providerId: transaction.providerId,
      subject: identity.username,
      tenantId: mapped.user.tenantId,
      roleIds: mapped.user.roleIds,
      displayName: mapped.user.displayName
    });
    const tokens = await issueSessionTokens(authRepository, session, authMasterKeyPath);
    appendAuditRecord({
      userId: mapped.user.id,
      actorType: "user",
      tenantId: mapped.user.tenantId,
      action: "auth.login.saml.succeeded",
      objectType: "login",
      objectId: session.id,
      metadata: {
        providerId: transaction.providerId,
        externalId: identity.externalId
      }
    });

    await invalidateAuthCache();
    createRedirectResponse(response, buildLoginSuccessRedirect(transaction.redirectBaseUrl, tokens));
  } catch (error) {
    appendAuditRecord({
      userId: null,
      actorType: "system",
      tenantId: null,
      action: "auth.login.saml.failed",
      objectType: "login",
      objectId: transaction.id,
      metadata: {
        providerId: transaction.providerId,
        reason: error instanceof Error ? error.message : "saml login failed"
      }
    });
    createRedirectResponse(
      response,
      buildLoginFailureRedirect(
        transaction.redirectBaseUrl,
        error instanceof Error ? error.message : "saml login failed"
      )
    );
  }
}

async function handleProviderTest(request: IncomingMessage, response: ServerResponse, providerId: string) {
  const identity = await requireAuthPermission(request, response, "auth:test");

  if (!identity) {
    return;
  }

  const provider = authRepository.getProviderRecord(providerId);

  if (!provider) {
    sendJson(response, 404, {
      error: {
        code: "provider_not_found",
        message: `provider ${providerId} was not found`
      }
    });
    return;
  }

  try {
    const result =
      provider.type === "local"
        ? { valid: true, reason: "local provider is always available" }
        : provider.type === "ldap"
          ? await testLdapProvider(authRepository.getProviderConfig(providerId) as never)
          : provider.type === "oidc"
            ? await testOidcProvider(authRepository.getProviderConfig(providerId) as never)
            : await testSamlProvider(authRepository.getProviderConfig(providerId) as never);

    authRepository.appendLog({
      level: result.valid ? "info" : "warn",
      action: "auth.provider.test",
      actorId: identity.id,
      providerId,
      sessionId: null,
      message: result.reason
    });
    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "auth.provider.tested",
      objectType: "auth-provider",
      objectId: providerId,
      metadata: {
        status: result.valid ? "passed" : "failed",
        reason: result.reason
      }
    });

    sendJson(response, 200, {
      providerId,
      status: result.valid ? "passed" : "failed",
      reason: result.reason
    });
  } catch (error) {
    sendJson(response, 400, {
      providerId,
      status: "failed",
      reason: error instanceof Error ? error.message : "provider test failed"
    });
  }
}

async function handleSaveProvider(
  request: IncomingMessage,
  response: ServerResponse,
  providerId?: string
) {
  const identity = await requireAuthPermission(request, response, "auth:write");

  if (!identity) {
    return;
  }

  const payload = await parseJsonBody(request).catch((error: unknown) => {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return null;
  });

  if (!payload) {
    return;
  }

  const type = String(payload["type"] ?? "") as AuthProviderType;
  const incomingConfig = ((payload["config"] as Record<string, unknown>) ?? {});
  const existingConfig =
    providerId && authRepository.getProviderRecord(providerId)
      ? (authRepository.getProviderConfig(providerId) as unknown as Record<string, unknown>)
      : null;
  const mergedConfig = Object.fromEntries(
    Object.entries(incomingConfig).map(([key, value]) => {
      if (value === maskedSecretValue && existingConfig && key in existingConfig) {
        return [key, existingConfig[key]];
      }

      return [key, value];
    })
  );
  const config = normalizeProviderConfig(type, mergedConfig);
  const validationErrors = validateProviderInput(type, config as unknown as Record<string, unknown>);

  if (validationErrors.length > 0) {
    sendJson(response, 400, {
      error: {
        code: "validation_failed",
        message: validationErrors.join("; ")
      }
    });
    return;
  }

  const saved = authRepository.saveProvider({
    id: providerId,
    name: String(payload["name"] ?? ""),
    type,
    enabled: Boolean(payload["enabled"]),
    isDefault: Boolean(payload["isDefault"]),
    config
  });

  authRepository.appendLog({
    level: "info",
    action: providerId ? "auth.provider.updated" : "auth.provider.created",
    actorId: identity.id,
    providerId: saved.id,
    sessionId: null,
    message: `${saved.type} provider ${saved.name} saved`
  });
  appendAuditRecord({
    userId: identity.id,
    actorType: "user",
    tenantId: identity.tenantId,
    action: providerId ? "auth.provider.updated" : "auth.provider.created",
    objectType: "auth-provider",
    objectId: saved.id,
    metadata: {
      providerType: saved.type,
      enabled: saved.enabled,
      isDefault: saved.isDefault
    }
  });

  await invalidateAuthCache();
  sendJson(response, providerId ? 200 : 201, {
    provider: saved
  });
}

async function handleRefresh(request: IncomingMessage, response: ServerResponse) {
  const payload: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const refreshToken = typeof payload["refreshToken"] === "string" ? payload["refreshToken"] : null;

  if (!refreshToken) {
    sendForbidden(response, "refresh token is required", 401);
    return;
  }

  try {
    const { verifySessionToken } = await import("../../../../packages/auth-core/dist/index.js");
    const decoded = await verifySessionToken(refreshToken, authMasterKeyPath, "refresh");
    const sessionId = typeof decoded["sessionId"] === "string" ? decoded["sessionId"] : null;

    if (!sessionId) {
      throw new Error("refresh token is missing session");
    }

    const session = authRepository.getSessionRecord(sessionId);

    if (!session || new Date(session.refreshExpiresAt).getTime() < Date.now()) {
      throw new Error("session is no longer refreshable");
    }

    const refreshedSession = authRepository.updateSession({
      ...session,
      updatedAt: new Date().toISOString()
    });
    const tokens = await issueSessionTokens(authRepository, refreshedSession, authMasterKeyPath);
    appendAuditRecord({
      userId: refreshedSession.userId,
      actorType: "user",
      tenantId: refreshedSession.tenantId,
      action: "auth.session.refreshed",
      objectType: "session",
      objectId: refreshedSession.id,
      metadata: {
        providerId: refreshedSession.providerId
      }
    });

    await invalidateAuthCache();
    sendJson(response, 200, mapSessionResponse(tokens));
  } catch (error) {
    sendForbidden(response, error instanceof Error ? error.message : "refresh failed", 401);
  }
}

async function handleSessionStatus(request: IncomingMessage, response: ServerResponse) {
  const identity = await createRequestIdentity(request);

  if (!identity) {
    sendForbidden(response, "authentication is required", 401);
    return;
  }

  await sendCachedJsonResponse(request, response, {
    cacheKind: "authSession",
    keyParts: ["status"]
  }, async () => ({
    identity,
    rbac: buildPermissionSummary(identity)
  }));
  appendAuditRecord({
    userId: identity.id,
    actorType: "user",
    tenantId: identity.tenantId,
    action: "auth.session.viewed",
    objectType: "session",
    objectId: identity.id,
    metadata: {
      method: identity.method
    }
  });
}

async function handleLogout(request: IncomingMessage, response: ServerResponse) {
  const payload: Record<string, unknown> = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const sessionId = typeof payload["sessionId"] === "string" ? payload["sessionId"] : null;

  if (!sessionId) {
    sendJson(response, 400, {
      error: {
        code: "missing_session_id",
        message: "logout requires a sessionId"
      }
    });
    return;
  }

  authRepository.deleteSession(sessionId);
  appendAuditRecord({
    userId: null,
    actorType: "system",
    tenantId: null,
    action: "auth.session.logged-out",
    objectType: "session",
    objectId: sessionId,
    metadata: {}
  });
  await invalidateAuthCache();
  sendJson(response, 200, {
    sessionId,
    loggedOut: true
  });
}

export async function handleAuthApiRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/auth")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Role-Ids, X-InfraLynx-Tenant-Id"
    });
    response.end();
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/providers/enabled") {
    await sendCachedJsonResponse(request, response, {
      cacheKind: "authEnabledProviders",
      keyParts: ["enabled"]
    }, async () => ({
      providers: authRepository.listEnabledProviders()
    }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login/local") {
    await handleLocalLogin(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login/ldap") {
    await handleLdapLogin(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login/oidc/start") {
    await handleOidcStart(request, response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/oidc/callback") {
    await handleOidcCallback(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login/saml/start") {
    await handleSamlStart(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/saml/callback") {
    await handleSamlCallback(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/refresh") {
    await handleRefresh(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    await handleLogout(request, response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/session") {
    await handleSessionStatus(request, response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/providers") {
    const identity = await requireAuthPermission(request, response, "auth:read");

    if (!identity) {
      return true;
    }

    await sendCachedJsonResponse(request, response, {
      cacheKind: "authProviders",
      keyParts: ["providers"]
    }, async () => ({
      providers: authRepository.listProviders()
    }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/providers") {
    await handleSaveProvider(request, response);
    return true;
  }

  const testMatch = requestUrl.pathname.match(/^\/api\/auth\/providers\/([^/]+)\/test$/);

  if (request.method === "POST" && testMatch) {
    await handleProviderTest(request, response, testMatch[1]);
    return true;
  }

  const providerMatch = requestUrl.pathname.match(/^\/api\/auth\/providers\/([^/]+)$/);

  if (providerMatch) {
    if (request.method === "GET") {
      const identity = await requireAuthPermission(request, response, "auth:read");

      if (!identity) {
        return true;
      }

      const provider = authRepository.getProviderById(providerMatch[1]);

      if (!provider) {
        sendJson(response, 404, {
          error: {
            code: "provider_not_found",
            message: `provider ${providerMatch[1]} was not found`
          }
        });
        return true;
      }

      await sendCachedJsonResponse(request, response, {
        cacheKind: "authProviderDetail",
        keyParts: ["provider", providerMatch[1]]
      }, async () => ({
        provider
      }));
      return true;
    }

    if (request.method === "PUT") {
      await handleSaveProvider(request, response, providerMatch[1]);
      return true;
    }

    if (request.method === "DELETE") {
      const identity = await requireAuthPermission(request, response, "auth:write");

      if (!identity) {
        return true;
      }

      if (!authRepository.deleteProvider(providerMatch[1])) {
        sendJson(response, 400, {
          error: {
            code: "delete_not_allowed",
            message: "provider could not be deleted"
          }
        });
        return true;
      }

      authRepository.appendLog({
        level: "info",
        action: "auth.provider.deleted",
        actorId: identity.id,
        providerId: providerMatch[1],
        sessionId: null,
        message: "provider deleted"
      });
      appendAuditRecord({
        userId: identity.id,
        actorType: "user",
        tenantId: identity.tenantId,
        action: "auth.provider.deleted",
        objectType: "auth-provider",
        objectId: providerMatch[1],
        metadata: {}
      });

      await invalidateAuthCache();
      sendJson(response, 200, {
        deletedId: providerMatch[1]
      });
      return true;
    }
  }

  return false;
}
