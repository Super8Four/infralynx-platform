import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createAuditRecord,
  createFileBackedAuditRepository,
  type AuditActorType,
  type AuditObjectType
} from "../../../../packages/audit/dist/index.js";
import { createRequestIdentity as resolveApiIdentity, requireApiPermission } from "../rbac/index.js";

const auditRootDirectory = resolve(process.cwd(), "runtime-data/audit");
const auditStateFilePath = resolve(auditRootDirectory, "state.json");

mkdirSync(dirname(auditStateFilePath), { recursive: true });

const auditRepository = createFileBackedAuditRepository(auditStateFilePath);

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function asString(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalString(value: string | null): string | undefined {
  return asString(value) ?? undefined;
}

export function appendAuditRecord(input: {
  readonly userId: string | null;
  readonly actorType: AuditActorType;
  readonly tenantId: string | null;
  readonly action: string;
  readonly objectType: AuditObjectType | string;
  readonly objectId: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: string;
}) {
  return auditRepository.append(createAuditRecord(input));
}

export async function appendAuditFromRequest(
  request: IncomingMessage,
  input: {
    readonly action: string;
    readonly objectType: AuditObjectType | string;
    readonly objectId: string | null;
    readonly metadata?: Record<string, unknown>;
  }
) {
  const identity = await resolveApiIdentity(request);

  return appendAuditRecord({
    userId: identity?.id ?? null,
    actorType: identity ? "user" : "system",
    tenantId: identity?.tenantId ?? null,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    metadata: input.metadata
  });
}

export async function handleAuditApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/audit")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/audit") {
    const identity = await requireApiPermission(request, response, "audit:read");

    if (!identity) {
      return true;
    }

    const limit = Number(requestUrl.searchParams.get("limit") ?? "100");
    const records = auditRepository.query({
      userId: asOptionalString(requestUrl.searchParams.get("userId")),
      action: asOptionalString(requestUrl.searchParams.get("action")),
      objectType: asOptionalString(requestUrl.searchParams.get("objectType")),
      objectId: asOptionalString(requestUrl.searchParams.get("objectId")),
      tenantId: asString(requestUrl.searchParams.get("tenantId")) ?? identity.tenantId,
      since: asOptionalString(requestUrl.searchParams.get("since")),
      until: asOptionalString(requestUrl.searchParams.get("until")),
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100
    });

    sendJson(response, 200, {
      records,
      total: records.length
    });
    return true;
  }

  const recordMatch = requestUrl.pathname.match(/^\/api\/audit\/([^/]+)$/);
  if (request.method === "GET" && recordMatch) {
    const identity = await requireApiPermission(request, response, "audit:read");

    if (!identity) {
      return true;
    }

    const record = auditRepository.getById(recordMatch[1]);

    if (!record) {
      sendJson(response, 404, {
        error: {
          code: "not_found",
          message: "audit record was not found"
        }
      });
      return true;
    }

    sendJson(response, 200, { record });
    return true;
  }

  return false;
}
