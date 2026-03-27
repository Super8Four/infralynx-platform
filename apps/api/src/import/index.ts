import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveAccessDecision, type AuthIdentity } from "../../../../packages/auth/dist/index.js";
import { defaultCoreRoles } from "../../../../packages/core-domain/dist/index.js";
import {
  applyImport,
  createImportJobPayload,
  type TransferDataset,
  type TransferFormat,
  validateImportInput
} from "../../../../packages/data-transfer/dist/index.js";
import { createJobRecord, type JobRecord } from "../../../../packages/job-core/dist/index.js";
import { createFileBackedJobQueueStore } from "../../../../packages/job-queue/dist/index.js";

const transferStateFilePath = resolve(process.cwd(), "runtime-data/transfers/state.json");
const jobsStateFilePath = resolve(process.cwd(), "runtime-data/jobs/queue-state.json");

mkdirSync(dirname(transferStateFilePath), { recursive: true });
mkdirSync(dirname(jobsStateFilePath), { recursive: true });

const jobQueue = createFileBackedJobQueueStore(jobsStateFilePath);

interface ImportRequestPayload {
  readonly dataset: TransferDataset;
  readonly format: TransferFormat;
  readonly dryRun?: boolean;
  readonly async?: boolean;
  readonly csvContent?: string;
  readonly jsonContent?: string;
  readonly records?: readonly Record<string, unknown>[];
}

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

function requirePermission(
  response: ServerResponse,
  context: AuthIdentity | null,
  permissionId: "transfer:write"
): context is AuthIdentity {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "import endpoints require actor and role headers"
      }
    });

    return false;
  }

  const decision = resolveAccessDecision(context, defaultCoreRoles, permissionId);

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

function isTransferDataset(value: unknown): value is TransferDataset {
  return value === "tenants" || value === "prefixes" || value === "sites";
}

function isTransferFormat(value: unknown): value is TransferFormat {
  return value === "csv" || value === "json" || value === "api";
}

async function parseImportPayload(request: IncomingMessage, response: ServerResponse) {
  let payload: ImportRequestPayload;

  try {
    payload = JSON.parse(await readRequestBody(request)) as ImportRequestPayload;
  } catch {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: "import requests must provide valid JSON payloads"
      }
    });

    return null;
  }

  if (!isTransferDataset(payload.dataset) || !isTransferFormat(payload.format)) {
    sendJson(response, 400, {
      error: {
        code: "invalid_transfer_request",
        message: "dataset and format must be valid transfer values"
      }
    });

    return null;
  }

  return payload;
}

function createJobResponse(job: JobRecord) {
  return {
    ...job,
    logs: jobQueue.listLogs(job.id)
  };
}

async function handleValidateImport(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "transfer:write")) {
    return;
  }

  const payload = await parseImportPayload(request, response);
  if (!payload) {
    return;
  }

  const validation = validateImportInput({
    dataset: payload.dataset,
    format: payload.format,
    csvContent: payload.csvContent,
    jsonContent: payload.jsonContent,
    records: payload.records
  });

  sendJson(response, 200, {
    dryRun: true,
    ...validation
  });
}

async function handleCommitImport(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "transfer:write")) {
    return;
  }

  const payload = await parseImportPayload(request, response);
  if (!payload) {
    return;
  }

  const validation = validateImportInput({
    dataset: payload.dataset,
    format: payload.format,
    csvContent: payload.csvContent,
    jsonContent: payload.jsonContent,
    records: payload.records
  });

  const shouldRunAsync = payload.async === true || validation.recordCount > 5;

  if (payload.dryRun === true) {
    sendJson(response, 200, {
      dryRun: true,
      ...validation
    });

    return;
  }

  if (!validation.valid) {
    sendJson(response, 400, {
      dryRun: false,
      ...validation
    });

    return;
  }

  if (shouldRunAsync) {
    const job = createJobRecord({
      type: "data-transfer.import",
      payload: createImportJobPayload({
        dataset: payload.dataset,
        format: payload.format,
        dryRun: false,
        csvContent: payload.csvContent,
        jsonContent: payload.jsonContent,
        records: payload.records,
        stateFilePath: transferStateFilePath
      }),
      createdBy: context.id
    });

    jobQueue.enqueue(job);

    sendJson(response, 202, {
      mode: "async",
      validation,
      job: createJobResponse(job)
    });

    return;
  }

  const result = applyImport(transferStateFilePath, {
    dataset: payload.dataset,
    format: payload.format,
    csvContent: payload.csvContent,
    jsonContent: payload.jsonContent,
    records: payload.records
  });

  sendJson(response, 200, {
    mode: "sync",
    ...result
  });
}

export async function handleImportApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/import")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/import/validate") {
    await handleValidateImport(request, response, context);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/import/commit") {
    await handleCommitImport(request, response, context);
    return true;
  }

  return false;
}
