import {
  clearStoredAuthSession,
  getStoredAuthSession,
  requestJson,
  setStoredAuthSession,
  type StoredAuthSession
} from "./api-client";

export type AuthProviderType = "local" | "ldap" | "oidc" | "saml";

export interface AuthProviderSummary {
  readonly id: string;
  readonly name: string;
  readonly type: AuthProviderType;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly configSummary: Record<string, unknown>;
}

export interface AuthIdentityResponse {
  readonly id: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly method: string;
  readonly roleIds: readonly string[];
  readonly displayName?: string;
}

export interface RbacAssignmentResponse {
  readonly id: string;
  readonly userId: string;
  readonly roleId: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
}

export interface AuthRbacSummaryResponse {
  readonly identity: AuthIdentityResponse;
  readonly permissions: readonly string[];
  readonly assignments: readonly RbacAssignmentResponse[];
}

export function readLoginResultFromHash(hash: string): StoredAuthSession | null {
  const cleaned = hash.replace(/^#/, "");

  if (!cleaned.startsWith("/login/success?")) {
    return null;
  }

  const query = cleaned.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const accessToken = params.get("accessToken");
  const refreshToken = params.get("refreshToken");
  const sessionId = params.get("sessionId");
  const userId = params.get("userId");
  const providerId = params.get("providerId");
  const tenantId = params.get("tenantId");
  const displayName = params.get("displayName");
  const roleIds = params.get("roleIds");
  const accessExpiresAt = params.get("accessExpiresAt");
  const refreshExpiresAt = params.get("refreshExpiresAt");

  if (!accessToken || !refreshToken || !sessionId || !userId || !providerId || !tenantId || !displayName || !roleIds || !accessExpiresAt || !refreshExpiresAt) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    session: {
      id: sessionId,
      userId,
      providerId,
      tenantId,
      roleIds: roleIds.split(",").filter(Boolean),
      displayName,
      accessExpiresAt,
      refreshExpiresAt
    }
  };
}

export async function fetchEnabledAuthProviders() {
  return requestJson<{ readonly providers: readonly AuthProviderSummary[] }>("/api/auth/providers/enabled");
}

export async function fetchAuthProviders() {
  return requestJson<{ readonly providers: readonly AuthProviderSummary[] }>("/api/auth/providers");
}

export async function fetchAuthProvider(providerId: string) {
  return requestJson<{ readonly provider: AuthProviderSummary }>(`/api/auth/providers/${providerId}`);
}

export async function saveAuthProvider(input: {
  readonly id?: string;
  readonly name: string;
  readonly type: AuthProviderType;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly config: Record<string, unknown>;
}) {
  return requestJson<{ readonly provider: AuthProviderSummary }>(
    input.id ? `/api/auth/providers/${input.id}` : "/api/auth/providers",
    {
      method: input.id ? "PUT" : "POST",
      body: input
    }
  );
}

export async function deleteAuthProvider(providerId: string) {
  return requestJson<{ readonly deletedId: string }>(`/api/auth/providers/${providerId}`, {
    method: "DELETE"
  });
}

export async function testAuthProvider(providerId: string) {
  return requestJson<{ readonly providerId: string; readonly status: string; readonly reason: string }>(
    `/api/auth/providers/${providerId}/test`,
    {
      method: "POST"
    }
  );
}

export async function loginWithLocal(username: string, password: string) {
  const session = await requestJson<StoredAuthSession>("/api/auth/login/local", {
    method: "POST",
    body: {
      username,
      password
    }
  });
  setStoredAuthSession(session);
  return session;
}

export async function loginWithLdap(providerId: string, username: string, password: string) {
  const session = await requestJson<StoredAuthSession>("/api/auth/login/ldap", {
    method: "POST",
    body: {
      providerId,
      username,
      password
    }
  });
  setStoredAuthSession(session);
  return session;
}

export async function startOidcLogin(providerId: string) {
  return requestJson<{ readonly redirectUrl: string }>("/api/auth/login/oidc/start", {
    method: "POST",
    body: {
      providerId,
      redirectBaseUrl: window.location.origin + "/"
    }
  });
}

export async function startSamlLogin(providerId: string) {
  return requestJson<{ readonly redirectUrl: string }>("/api/auth/login/saml/start", {
    method: "POST",
    body: {
      providerId,
      redirectBaseUrl: window.location.origin + "/"
    }
  });
}

export async function fetchCurrentAuthSession() {
  return requestJson<{ readonly identity: AuthIdentityResponse; readonly rbac: AuthRbacSummaryResponse }>("/api/auth/session");
}

export async function refreshCurrentAuthSession() {
  const current = getStoredAuthSession();

  if (!current) {
    throw new Error("refresh requires an existing session");
  }

  const refreshed = await requestJson<StoredAuthSession>("/api/auth/refresh", {
    method: "POST",
    body: {
      refreshToken: current.refreshToken
    }
  });
  setStoredAuthSession(refreshed);
  return refreshed;
}

export async function logoutCurrentAuthSession() {
  const current = getStoredAuthSession();

  if (current) {
    await requestJson("/api/auth/logout", {
      method: "POST",
      body: {
        sessionId: current.session.id
      }
    }).catch(() => undefined);
  }

  clearStoredAuthSession();
}
