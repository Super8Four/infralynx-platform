import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  backupEngineStrategies,
  createFileBackedBackupStore,
  supportedBackupSections,
  type BackupEngine,
  type BackupMode,
  type BackupSection
} from "../../../../packages/backup/dist/index.js";
import { createFileBackedSchedulerStore, validateScheduleInput } from "../../../../packages/scheduler/dist/index.js";
import { appendAuditRecord } from "../audit/index.js";
import { requireApiPermission } from "../rbac/index.js";

const runtimeDataRoot = resolve(process.cwd(), "runtime-data");
const backupRootDirectory = resolve(runtimeDataRoot, "backups");
const backupStateFilePath = resolve(backupRootDirectory, "state.json");
const backupArchiveDirectory = resolve(backupRootDirectory, "archives");
const schedulerStateFilePath = resolve(runtimeDataRoot, "scheduler", "state.json");

mkdirSync(dirname(backupStateFilePath), { recursive: true });

const backupStore = createFileBackedBackupStore({
  stateFilePath: backupStateFilePath,
  archiveDirectory: backupArchiveDirectory,
  sourceRoot: runtimeDataRoot
});
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

function asMode(value: unknown): BackupMode {
  return value === "partial" ? "partial" : "full";
}

function asEngine(value: unknown): BackupEngine {
  return value === "postgres" || value === "mssql" || value === "mariadb" ? value : "bootstrap-file-store";
}

function asSections(value: unknown): readonly BackupSection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(
    (entry): entry is BackupSection => typeof entry === "string" && supportedBackupSections.includes(entry as BackupSection)
  );
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function handleCreateBackup(request: IncomingMessage, response: ServerResponse) {
  const identity = await requireApiPermission(request, response, "backup:write");

  if (!identity) {
    return;
  }

  try {
    const payload = await parseJsonBody(request);
    const result = backupStore.createBackup({
      mode: asMode(payload["mode"]),
      sections: asSections(payload["sections"]),
      engine: asEngine(payload["engine"]),
      label: asString(payload["label"]) ?? undefined,
      createdBy: identity.id,
      tenantId: identity.tenantId
    });

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "backup.created",
      objectType: "backup",
      objectId: result.record.id,
      metadata: {
        mode: result.record.mode,
        sections: result.record.sections,
        engine: result.record.engine,
        sizeBytes: result.record.sizeBytes
      }
    });

    sendJson(response, 201, {
      backup: result.record,
      logs: result.logs,
      strategy: backupEngineStrategies[result.record.engine]
    });
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "backup_create_failed",
        message: error instanceof Error ? error.message : "backup creation failed"
      }
    });
  }
}

async function handleValidateRestore(request: IncomingMessage, response: ServerResponse) {
  const identity = await requireApiPermission(request, response, "backup:read");

  if (!identity) {
    return;
  }

  try {
    const payload = await parseJsonBody(request);
    const backupId = asString(payload["backupId"]);

    if (!backupId) {
      sendJson(response, 400, {
        error: {
          code: "missing_backup_id",
          message: "restore validation requires a backupId"
        }
      });
      return;
    }

    sendJson(response, 200, {
      backupId,
      preview: backupStore.validateRestore(backupId)
    });
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "restore_validation_failed",
        message: error instanceof Error ? error.message : "restore validation failed"
      }
    });
  }
}

async function handleRestoreBackup(request: IncomingMessage, response: ServerResponse) {
  const identity = await requireApiPermission(request, response, "backup:restore");

  if (!identity) {
    return;
  }

  try {
    const payload = await parseJsonBody(request);
    const backupId = asString(payload["backupId"]);

    if (!backupId) {
      sendJson(response, 400, {
        error: {
          code: "missing_backup_id",
          message: "restore requests require a backupId"
        }
      });
      return;
    }

    const result = backupStore.restoreBackup(backupId);

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "backup.restored",
      objectType: "backup",
      objectId: backupId,
      metadata: {
        sections: result.sections,
        warnings: result.warnings
      }
    });

    sendJson(response, 200, {
      backupId,
      result
    });
  } catch (error) {
    sendJson(response, 409, {
      error: {
        code: "restore_failed",
        message: error instanceof Error ? error.message : "restore failed"
      }
    });
  }
}

async function handleCreateBackupSchedule(request: IncomingMessage, response: ServerResponse) {
  const identity = await requireApiPermission(request, response, "schedule:write");

  if (!identity) {
    return;
  }

  try {
    const payload = await parseJsonBody(request);
    const mode = asMode(payload["mode"]);
    const sections = asSections(payload["sections"]);
    const scheduleInput = {
      name: asString(payload["name"]) ?? "scheduled backup",
      cronExpression: asString(payload["cronExpression"]) ?? "",
      timezone: "UTC",
      jobType: "backup.create",
      payload: {
        mode,
        sections,
        engine: asEngine(payload["engine"]),
        label: asString(payload["label"]) ?? "scheduled-backup",
        createdBy: identity.id,
        tenantId: identity.tenantId
      }
    };
    const validation = validateScheduleInput(scheduleInput);

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
      name: scheduleInput.name,
      cronExpression: scheduleInput.cronExpression,
      timezone: "UTC",
      jobType: "backup.create",
      payload: scheduleInput.payload,
      enabled: true,
      createdBy: identity.id
    });

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "backup.schedule.created",
      objectType: "schedule",
      objectId: schedule.id,
      metadata: {
        jobType: schedule.jobType,
        backupMode: mode,
        sections
      }
    });

    sendJson(response, 201, {
      schedule
    });
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "schedule_create_failed",
        message: error instanceof Error ? error.message : "backup schedule creation failed"
      }
    });
  }
}

export async function handleBackupApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/backup")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/backup") {
    const identity = await requireApiPermission(request, response, "backup:read");

    if (!identity) {
      return true;
    }

    sendJson(response, 200, {
      backups: backupStore.listBackups(),
      logs: backupStore.listLogs(),
      supportedSections: supportedBackupSections,
      engineStrategies: backupEngineStrategies
    });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/backup/create") {
    await handleCreateBackup(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/backup/restore/validate") {
    await handleValidateRestore(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/backup/restore") {
    await handleRestoreBackup(request, response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/backup/schedules") {
    await handleCreateBackupSchedule(request, response);
    return true;
  }

  const backupMatch = requestUrl.pathname.match(/^\/api\/backup\/([^/]+)$/);

  if (backupMatch && request.method === "GET") {
    const identity = await requireApiPermission(request, response, "backup:read");

    if (!identity) {
      return true;
    }

    const backup = backupStore.getBackup(backupMatch[1]);

    if (!backup) {
      sendJson(response, 404, {
        error: {
          code: "backup_not_found",
          message: `backup ${backupMatch[1]} was not found`
        }
      });
      return true;
    }

    sendJson(response, 200, {
      backup,
      logs: backupStore.listLogs(backup.id),
      preview: backupStore.validateRestore(backup.id)
    });
    return true;
  }

  if (backupMatch && request.method === "DELETE") {
    const identity = await requireApiPermission(request, response, "backup:write");

    if (!identity) {
      return true;
    }

    const deleted = backupStore.deleteBackup(backupMatch[1]);

    if (!deleted) {
      sendJson(response, 404, {
        error: {
          code: "backup_not_found",
          message: `backup ${backupMatch[1]} was not found`
        }
      });
      return true;
    }

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "backup.deleted",
      objectType: "backup",
      objectId: backupMatch[1],
      metadata: {}
    });

    sendJson(response, 200, {
      deletedId: backupMatch[1]
    });
    return true;
  }

  return false;
}
