import { type IncomingMessage, type ServerResponse } from "node:http";

import {
  createInventoryContext,
  getInventoryPermissionId,
  isWritableResource,
  validateInventoryMutationPayload,
  type WritableInventoryResource
} from "../inventory/index.js";
import { requireApiPermission } from "../rbac/index.js";

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

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMutationAction(value: unknown): value is "create" | "update" {
  return value === "create" || value === "update";
}

export async function handleValidationApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/validation")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/validation/inventory") {
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
      return true;
    }

    const resource = asString(payload["resource"]);
    const operation = payload["operation"];
    const record = payload["record"];
    const existingId = asString(payload["existingId"]);

    if (!resource || !isWritableResource(resource)) {
      sendJson(response, 400, {
        error: {
          code: "invalid_resource",
          message: "resource must be one of: sites, racks, devices, prefixes, ip-addresses"
        }
      });
      return true;
    }

    const writableResource: WritableInventoryResource = resource;

    if (!isMutationAction(operation)) {
      sendJson(response, 400, {
        error: {
          code: "invalid_operation",
          message: "operation must be create or update"
        }
      });
      return true;
    }

    if (!isRecord(record)) {
      sendJson(response, 400, {
        error: {
          code: "invalid_record",
          message: "record must be a JSON object"
        }
      });
      return true;
    }

    const identity = await requireApiPermission(
      request,
      response,
      getInventoryPermissionId(writableResource, "write"),
      { tenantId: "tenant-ops" }
    );

    if (!identity) {
      return true;
    }

    const context = createInventoryContext();
    const outcome = validateInventoryMutationPayload(context, writableResource, record, {
      operation,
      existingId: operation === "update" ? existingId ?? undefined : undefined
    });

    sendJson(response, outcome.validation.valid ? 200 : outcome.validation.conflicts.length > 0 ? 409 : 400, {
      resource: writableResource,
      operation,
      actorId: identity.id,
      validation: {
        valid: outcome.validation.valid,
        errors: outcome.validation.errors,
        conflicts: outcome.validation.conflicts,
        warnings: outcome.validation.warnings
      },
      candidateRecord: outcome.validation.record
    });
    return true;
  }

  return false;
}
