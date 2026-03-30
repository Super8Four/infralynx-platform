import { createVersionedApiPath } from "../../../../packages/api-contracts/dist/index.js";

export class ApiClientError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(message: string, statusCode: number | null, retryable: boolean, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details ?? null;
  }
}

interface RequestJsonOptions {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
}

export interface StoredAuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly session: {
    readonly id: string;
    readonly userId: string;
    readonly providerId: string;
    readonly tenantId: string;
    readonly roleIds: readonly string[];
    readonly displayName: string;
    readonly accessExpiresAt: string;
    readonly refreshExpiresAt: string;
  };
}

const authStorageKey = "infralynx.auth.session";

export function getStoredAuthSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(authStorageKey);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session: StoredAuthSession) {
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

export function clearStoredAuthSession() {
  window.localStorage.removeItem(authStorageKey);
}

function createDefaultHeaders(): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const session = getStoredAuthSession();

  if (session) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
    return headers;
  }

  headers.set("X-InfraLynx-Actor-Id", "ui-bootstrap-admin");
  headers.set("X-InfraLynx-Role-Ids", "core-platform-admin");
  headers.set("X-InfraLynx-Tenant-Id", "tenant-ops");

  return headers;
}

export async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
  const headers = createDefaultHeaders();
  const apiPath = createVersionedApiPath(path);

  for (const [key, value] of new Headers(options.headers).entries()) {
    headers.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(apiPath, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiClientError("Unable to reach the InfraLynx API.", null, true);
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { readonly error: { readonly message?: string } }).error
        : null;

    throw new ApiClientError(
      errorPayload?.message ?? `InfraLynx API request failed with status ${response.status}.`,
      response.status,
      response.status >= 500,
      payload
    );
  }

  return payload as T;
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { signal });
}
