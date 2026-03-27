import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveAccessDecision, type AuthIdentity } from "../../../../packages/auth/dist/index.js";
import { defaultCoreRoles } from "../../../../packages/core-domain/dist/index.js";
import {
  createFileBackedSchedulerStore,
  type ScheduleRecord,
  validateCronExpression,
  validateScheduleInput
} from "../../../../packages/scheduler/dist/index.js";

interface CreateSchedulePayload {
  readonly name: string;
  readonly cronExpression: string;
  readonly timezone?: string;
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly enabled?: boolean;
}

const schedulerRootDirectory = resolve(process.cwd(), "runtime-data/scheduler");
const schedulerStateFilePath = resolve(schedulerRootDirectory, "state.json");

mkdirSync(dirname(schedulerStateFilePath), { recursive: true });

const schedulerStore = createFileBackedSchedulerStore(schedulerStateFilePath);

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
  const tenantIdHeader = request.headers["x-infralynx-tenant-id"];

  if (typeof actorId !== "string" || typeof roleIdsHeader !== "string") {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId: typeof tenantIdHeader === "string" && tenantIdHeader.trim().length > 0 ? tenantIdHeader : "platform",
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
  permissionId: "schedule:read" | "schedule:write"
): context is AuthIdentity {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "scheduler endpoints require actor and role headers"
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

function mapScheduleResponse(schedule: ScheduleRecord) {
  return {
    ...schedule,
    cron: {
      expression: schedule.cronExpression,
      validation: validateCronExpression(schedule.cronExpression).reason
    }
  };
}

async function handleCreateSchedule(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "schedule:write")) {
    return;
  }

  let payload: CreateSchedulePayload;

  try {
    payload = JSON.parse(await readRequestBody(request)) as CreateSchedulePayload;
  } catch {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: "schedule creation requests must provide valid JSON payloads"
      }
    });

    return;
  }

  const validation = validateScheduleInput({
    name: payload.name,
    cronExpression: payload.cronExpression,
    jobType: payload.jobType,
    payload: payload.payload,
    timezone: payload.timezone
  });

  if (!validation.valid) {
    sendJson(response, 400, {
      error: {
        code: "invalid_schedule",
        message: validation.reason
      }
    });

    return;
  }

  const schedule = schedulerStore.createSchedule({
    name: payload.name.trim(),
    cronExpression: payload.cronExpression.trim(),
    timezone: payload.timezone?.trim() || "UTC",
    jobType: payload.jobType.trim(),
    payload: payload.payload,
    enabled: payload.enabled ?? true,
    createdBy: context.id
  });

  sendJson(response, 201, {
    schedule: mapScheduleResponse(schedule)
  });
}

async function handleUpdateSchedule(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null,
  scheduleId: string
) {
  if (!requirePermission(response, context, "schedule:write")) {
    return;
  }

  let payload: Partial<CreateSchedulePayload>;

  try {
    payload = JSON.parse(await readRequestBody(request)) as Partial<CreateSchedulePayload>;
  } catch {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: "schedule update requests must provide valid JSON payloads"
      }
    });

    return;
  }

  const existing = schedulerStore.getSchedule(scheduleId);

  if (!existing) {
    sendJson(response, 404, {
      error: {
        code: "schedule_not_found",
        message: `no schedule matched ${scheduleId}`
      }
    });

    return;
  }

  const merged = {
    name: payload.name ?? existing.name,
    cronExpression: payload.cronExpression ?? existing.cronExpression,
    jobType: payload.jobType ?? existing.jobType,
    payload: payload.payload ?? existing.payload,
    timezone: payload.timezone ?? existing.timezone
  };
  const validation = validateScheduleInput(merged);

  if (!validation.valid) {
    sendJson(response, 400, {
      error: {
        code: "invalid_schedule",
        message: validation.reason
      }
    });

    return;
  }

  const updated = schedulerStore.updateSchedule(scheduleId, {
    name: merged.name.trim(),
    cronExpression: merged.cronExpression.trim(),
    timezone: merged.timezone.trim(),
    jobType: merged.jobType.trim(),
    payload: merged.payload,
    enabled: payload.enabled ?? existing.enabled
  });

  sendJson(response, 200, {
    schedule: updated ? mapScheduleResponse(updated) : null
  });
}

function handleListSchedules(response: ServerResponse, context: AuthIdentity | null) {
  if (!requirePermission(response, context, "schedule:read")) {
    return;
  }

  sendJson(response, 200, {
    schedules: schedulerStore.listSchedules().map((schedule) => mapScheduleResponse(schedule))
  });
}

function handleGetSchedule(response: ServerResponse, context: AuthIdentity | null, scheduleId: string) {
  if (!requirePermission(response, context, "schedule:read")) {
    return;
  }

  const schedule = schedulerStore.getSchedule(scheduleId);

  if (!schedule) {
    sendJson(response, 404, {
      error: {
        code: "schedule_not_found",
        message: `no schedule matched ${scheduleId}`
      }
    });

    return;
  }

  sendJson(response, 200, {
    schedule: mapScheduleResponse(schedule),
    logs: schedulerStore.listLogs(scheduleId)
  });
}

function handleDeleteSchedule(response: ServerResponse, context: AuthIdentity | null, scheduleId: string) {
  if (!requirePermission(response, context, "schedule:write")) {
    return;
  }

  const deleted = schedulerStore.deleteSchedule(scheduleId);

  if (!deleted) {
    sendJson(response, 404, {
      error: {
        code: "schedule_not_found",
        message: `no schedule matched ${scheduleId}`
      }
    });

    return;
  }

  sendJson(response, 200, {
    deleted: true,
    scheduleId
  });
}

function handleListScheduleLogs(response: ServerResponse, context: AuthIdentity | null) {
  if (!requirePermission(response, context, "schedule:read")) {
    return;
  }

  sendJson(response, 200, {
    logs: schedulerStore.listLogs()
  });
}

export async function handleSchedulerApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/schedules")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/schedules") {
    await handleCreateSchedule(request, response, context);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/schedules") {
    handleListSchedules(response, context);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/schedules/logs") {
    handleListScheduleLogs(response, context);
    return true;
  }

  const scheduleMatch = requestUrl.pathname.match(/^\/api\/schedules\/([^/]+)$/);

  if (scheduleMatch && request.method === "GET") {
    handleGetSchedule(response, context, scheduleMatch[1]);
    return true;
  }

  if (scheduleMatch && request.method === "PUT") {
    await handleUpdateSchedule(request, response, context, scheduleMatch[1]);
    return true;
  }

  if (scheduleMatch && request.method === "DELETE") {
    handleDeleteSchedule(response, context, scheduleMatch[1]);
    return true;
  }

  return false;
}
