import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveAccessDecision, type AuthIdentity } from "../../../../packages/auth/dist/index.js";
import { defaultCoreRoles } from "../../../../packages/core-domain/dist/index.js";
import {
  createJobRecord,
  type JobLogRecord,
  type JobRecord
} from "../../../../packages/job-core/dist/index.js";
import { createFileBackedJobQueueStore } from "../../../../packages/job-queue/dist/index.js";

interface CreateJobPayload {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface ApiJobResponse extends JobRecord {
  readonly logs: readonly JobLogRecord[];
}

const jobsRootDirectory = resolve(process.cwd(), "runtime-data/jobs");
const jobsStateFilePath = resolve(jobsRootDirectory, "queue-state.json");

mkdirSync(dirname(jobsStateFilePath), { recursive: true });

const jobQueue = createFileBackedJobQueueStore(jobsStateFilePath);

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

  if (typeof actorId !== "string" || typeof roleIdsHeader !== "string") {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId: "platform",
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
  permissionId: "job:read" | "job:write"
): context is AuthIdentity {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "job endpoints require actor and role headers"
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

function mapJobResponse(job: JobRecord): ApiJobResponse {
  return {
    ...job,
    logs: jobQueue.listLogs(job.id)
  };
}

async function handleCreateJob(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "job:write")) {
    return;
  }

  let payload: CreateJobPayload;

  try {
    payload = JSON.parse(await readRequestBody(request)) as CreateJobPayload;
  } catch {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: "job creation requests must provide valid JSON payloads"
      }
    });

    return;
  }

  if (typeof payload.type !== "string" || payload.type.trim().length === 0) {
    sendJson(response, 400, {
      error: {
        code: "invalid_job_type",
        message: "job type must be a non-empty string"
      }
    });

    return;
  }

  if (!payload.payload || typeof payload.payload !== "object" || Array.isArray(payload.payload)) {
    sendJson(response, 400, {
      error: {
        code: "invalid_job_payload",
        message: "job payload must be a JSON object"
      }
    });

    return;
  }

  const job = createJobRecord({
    type: payload.type,
    payload: payload.payload,
    createdBy: context.id
  });

  jobQueue.enqueue(job);

  sendJson(response, 201, {
    job: mapJobResponse(job)
  });
}

function handleListJobs(
  response: ServerResponse,
  requestUrl: URL,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "job:read")) {
    return;
  }

  const rawStatus = requestUrl.searchParams.get("status");
  const status =
    rawStatus === "pending" ||
    rawStatus === "running" ||
    rawStatus === "success" ||
    rawStatus === "failed"
      ? rawStatus
      : undefined;

  sendJson(response, 200, {
    jobs: jobQueue.listJobs(status).map((job) => mapJobResponse(job))
  });
}

function handleGetJob(
  response: ServerResponse,
  context: AuthIdentity | null,
  jobId: string
) {
  if (!requirePermission(response, context, "job:read")) {
    return;
  }

  const job = jobQueue.getJob(jobId);

  if (!job) {
    sendJson(response, 404, {
      error: {
        code: "job_not_found",
        message: `no job matched ${jobId}`
      }
    });

    return;
  }

  sendJson(response, 200, {
    job: mapJobResponse(job)
  });
}

function handleGetJobLogs(
  response: ServerResponse,
  context: AuthIdentity | null,
  jobId: string
) {
  if (!requirePermission(response, context, "job:read")) {
    return;
  }

  const job = jobQueue.getJob(jobId);

  if (!job) {
    sendJson(response, 404, {
      error: {
        code: "job_not_found",
        message: `no job matched ${jobId}`
      }
    });

    return;
  }

  sendJson(response, 200, {
    jobId,
    logs: jobQueue.listLogs(jobId)
  });
}

export async function handleJobsApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/jobs")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/jobs") {
    await handleCreateJob(request, response, context);

    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/jobs") {
    handleListJobs(response, requestUrl, context);

    return true;
  }

  const logsMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)\/logs$/);

  if (request.method === "GET" && logsMatch) {
    handleGetJobLogs(response, context, logsMatch[1]);

    return true;
  }

  const jobMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)$/);

  if (request.method === "GET" && jobMatch) {
    handleGetJob(response, context, jobMatch[1]);

    return true;
  }

  return false;
}
