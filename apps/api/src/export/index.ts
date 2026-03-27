import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveAccessDecision, type AuthIdentity } from "../../../../packages/auth/dist/index.js";
import { defaultCoreRoles } from "../../../../packages/core-domain/dist/index.js";
import { exportDataset, type TransferDataset, type TransferFormat } from "../../../../packages/data-transfer/dist/index.js";

const transferStateFilePath = resolve(process.cwd(), "runtime-data/transfers/state.json");
mkdirSync(dirname(transferStateFilePath), { recursive: true });

function createContextFromHeaders(request: IncomingMessage): AuthIdentity | null {
  const actorId = request.headers["x-infralynx-actor-id"];
  const roleIdsHeader = request.headers["x-infralynx-role-ids"];
  const tenantId = request.headers["x-infralynx-tenant-id"];

  if (typeof actorId !== "string" || typeof roleIdsHeader !== "string") {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId: typeof tenantId === "string" ? tenantId : "platform",
    method: "api-token",
    roleIds: roleIdsHeader
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function requirePermission(response: ServerResponse, context: AuthIdentity | null): context is AuthIdentity {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "export endpoints require actor and role headers"
      }
    });

    return false;
  }

  const decision = resolveAccessDecision(context, defaultCoreRoles, "transfer:read");

  if (!decision.allowed) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: decision.reason
      }
    });

    return false;
  }

  return true;
}

function isTransferDataset(value: string): value is TransferDataset {
  return value === "tenants" || value === "prefixes" || value === "sites";
}

function isTransferFormat(value: string | null): value is TransferFormat {
  return value === "csv" || value === "json" || value === "api";
}

export async function handleExportApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/export")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  const datasetMatch = requestUrl.pathname.match(/^\/api\/export\/([^/]+)$/);

  if (request.method !== "GET" || !datasetMatch) {
    return false;
  }

  if (!requirePermission(response, context)) {
    return true;
  }

  if (!isTransferDataset(datasetMatch[1])) {
    sendJson(response, 400, {
      error: {
        code: "invalid_dataset",
        message: "export dataset must be tenants, prefixes, or sites"
      }
    });

    return true;
  }

  const format = isTransferFormat(requestUrl.searchParams.get("format"))
    ? (requestUrl.searchParams.get("format") as TransferFormat)
    : "json";

  const document = exportDataset(transferStateFilePath, datasetMatch[1], format);

  response.writeHead(200, {
    "Content-Type": document.contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Content-Disposition": `inline; filename="${datasetMatch[1]}.${format === "csv" ? "csv" : "json"}"`
  });
  response.end(document.body);

  return true;
}
