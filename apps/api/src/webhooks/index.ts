import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { resolveAccessDecision, type AuthIdentity } from "../../../../packages/auth/dist/index.js";
import { defaultCoreRoles } from "../../../../packages/core-domain/dist/index.js";
import {
  createEventRecord,
  createFileBackedEventRepository,
  isEventType,
  supportedEventTypes,
  type EventRecord,
  type EventType
} from "../../../../packages/event-core/dist/index.js";
import { createFileBackedJobQueueStore } from "../../../../packages/job-queue/dist/index.js";
import {
  createFileBackedWebhookRepository,
  createWebhookDeliveryJob,
  createWebhookRecord,
  resolveWebhookAccess,
  validateWebhookConfiguration,
  webhookMatchesEvent,
  type WebhookRecord
} from "../../../../packages/webhooks/dist/index.js";
import { appendAuditRecord } from "../audit/index.js";

const webhooksRootDirectory = resolve(process.cwd(), "runtime-data/webhooks");
const eventsRootDirectory = resolve(process.cwd(), "runtime-data/events");
const jobsRootDirectory = resolve(process.cwd(), "runtime-data/jobs");

const webhooksStateFilePath = resolve(webhooksRootDirectory, "state.json");
const eventsStateFilePath = resolve(eventsRootDirectory, "events.json");
const jobsStateFilePath = resolve(jobsRootDirectory, "queue-state.json");

mkdirSync(dirname(webhooksStateFilePath), { recursive: true });
mkdirSync(dirname(eventsStateFilePath), { recursive: true });
mkdirSync(dirname(jobsStateFilePath), { recursive: true });

const webhookRepository = createFileBackedWebhookRepository(webhooksStateFilePath);
const eventRepository = createFileBackedEventRepository(eventsStateFilePath);
const jobQueue = createFileBackedJobQueueStore(jobsStateFilePath);

interface CreateWebhookPayload {
  readonly endpointUrl: string;
  readonly eventTypes: readonly string[];
  readonly secret?: string;
  readonly enabled?: boolean;
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

function createContextFromHeaders(request: IncomingMessage): AuthIdentity | null {
  const actorId = request.headers["x-infralynx-actor-id"];
  const roleIdsHeader = request.headers["x-infralynx-role-ids"];
  const tenantIdHeader = request.headers["x-infralynx-tenant-id"];

  if (
    typeof actorId !== "string" ||
    typeof roleIdsHeader !== "string" ||
    typeof tenantIdHeader !== "string"
  ) {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId: tenantIdHeader,
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
  permissionId: "event:read" | "webhook:read" | "webhook:write" | "webhook:delete"
): context is AuthIdentity {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "webhook endpoints require actor, tenant, and role headers"
      }
    });

    return false;
  }

  const decision =
    permissionId === "event:read"
      ? resolveAccessDecision(context, defaultCoreRoles, permissionId)
      : resolveWebhookAccess(context, permissionId, defaultCoreRoles);

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

function maskWebhookSecret(secret: string): string {
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function mapWebhookResponse(webhook: WebhookRecord) {
  return {
    ...webhook,
    secretPreview: maskWebhookSecret(webhook.secret)
  };
}

export function emitPlatformEvent(input: {
  readonly type: EventType;
  readonly payload: Record<string, unknown>;
  readonly createdBy: string;
}): EventRecord {
  const event = createEventRecord({
    type: input.type,
    payload: input.payload
  });

  eventRepository.saveEvent(event);

  for (const webhook of webhookRepository.listWebhooks().filter((entry) => webhookMatchesEvent(entry, event))) {
    jobQueue.enqueue(
      createWebhookDeliveryJob({
        event,
        webhook,
        createdBy: input.createdBy
      })
    );
  }

  return event;
}

export function getWebhookRuntimeRepositories() {
  return {
    webhookRepository,
    eventRepository
  };
}

async function handleCreateWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null
) {
  if (!requirePermission(response, context, "webhook:write")) {
    return;
  }

  let payload: CreateWebhookPayload;

  try {
    payload = (await parseJsonBody(request)) as unknown as CreateWebhookPayload;
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return;
  }

  const endpointUrl = typeof payload.endpointUrl === "string" ? payload.endpointUrl.trim() : "";
  const rawEventTypes = Array.isArray(payload.eventTypes) ? payload.eventTypes.filter((value): value is string => typeof value === "string") : [];
  const validation = validateWebhookConfiguration({
    endpointUrl,
    eventTypes: rawEventTypes
  });

  if (!validation.valid) {
    sendJson(response, 400, {
      error: {
        code: "invalid_webhook_configuration",
        message: validation.reason
      }
    });
    return;
  }

  const webhook = createWebhookRecord({
    endpointUrl,
    eventTypes: rawEventTypes.map((value) => (value === "*" ? "*" : value as EventType)),
    secret: typeof payload.secret === "string" && payload.secret.trim().length > 0 ? payload.secret.trim() : undefined,
    enabled: payload.enabled !== false
  });

  webhookRepository.saveWebhook(webhook);
  emitPlatformEvent({
    type: "webhook.created",
    createdBy: context.id,
    payload: {
      webhookId: webhook.id,
      endpointUrl: webhook.endpointUrl,
      eventTypes: webhook.eventTypes,
      enabled: webhook.enabled
    }
  });
  appendAuditRecord({
    userId: context.id,
    actorType: "user",
    tenantId: context.tenantId,
    action: "webhook.created",
    objectType: "webhook",
    objectId: webhook.id,
    metadata: {
      endpointUrl: webhook.endpointUrl,
      enabled: webhook.enabled
    }
  });

  sendJson(response, 201, {
    webhook: mapWebhookResponse(webhook)
  });
}

async function handleUpdateWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  context: AuthIdentity | null,
  webhookId: string
) {
  if (!requirePermission(response, context, "webhook:write")) {
    return;
  }

  const existing = webhookRepository.getWebhookById(webhookId);

  if (!existing) {
    sendJson(response, 404, {
      error: {
        code: "webhook_not_found",
        message: `no webhook matched ${webhookId}`
      }
    });
    return;
  }

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

  const endpointUrl =
    typeof payload["endpointUrl"] === "string" ? payload["endpointUrl"].trim() : existing.endpointUrl;
  const rawEventTypes = Array.isArray(payload["eventTypes"])
    ? payload["eventTypes"].filter((value): value is string => typeof value === "string")
    : [...existing.eventTypes];
  const validation = validateWebhookConfiguration({
    endpointUrl,
    eventTypes: rawEventTypes
  });

  if (!validation.valid) {
    sendJson(response, 400, {
      error: {
        code: "invalid_webhook_configuration",
        message: validation.reason
      }
    });
    return;
  }

  const updated: WebhookRecord = {
    ...existing,
    endpointUrl,
    eventTypes: rawEventTypes.map((value) => (value === "*" ? "*" : value as EventType)),
    enabled: typeof payload["enabled"] === "boolean" ? payload["enabled"] : existing.enabled,
    secret:
      typeof payload["secret"] === "string" && payload["secret"].trim().length > 0
        ? payload["secret"].trim()
        : existing.secret,
    updatedAt: new Date().toISOString()
  };

  webhookRepository.updateWebhook(updated);
  emitPlatformEvent({
    type: "webhook.updated",
    createdBy: context.id,
    payload: {
      webhookId: updated.id,
      endpointUrl: updated.endpointUrl,
      eventTypes: updated.eventTypes,
      enabled: updated.enabled
    }
  });
  appendAuditRecord({
    userId: context.id,
    actorType: "user",
    tenantId: context.tenantId,
    action: "webhook.updated",
    objectType: "webhook",
    objectId: updated.id,
    metadata: {
      endpointUrl: updated.endpointUrl,
      enabled: updated.enabled
    }
  });

  sendJson(response, 200, {
    webhook: mapWebhookResponse(updated)
  });
}

function handleDeleteWebhook(
  response: ServerResponse,
  context: AuthIdentity | null,
  webhookId: string
) {
  if (!requirePermission(response, context, "webhook:delete")) {
    return;
  }

  const existing = webhookRepository.getWebhookById(webhookId);

  if (!existing) {
    sendJson(response, 404, {
      error: {
        code: "webhook_not_found",
        message: `no webhook matched ${webhookId}`
      }
    });
    return;
  }

  webhookRepository.deleteWebhook(webhookId);
  emitPlatformEvent({
    type: "webhook.deleted",
    createdBy: context.id,
    payload: {
      webhookId: existing.id,
      endpointUrl: existing.endpointUrl
    }
  });
  appendAuditRecord({
    userId: context.id,
    actorType: "user",
    tenantId: context.tenantId,
    action: "webhook.deleted",
    objectType: "webhook",
    objectId: existing.id,
    metadata: {
      endpointUrl: existing.endpointUrl
    }
  });

  sendJson(response, 200, {
    deletedId: webhookId
  });
}

function handleListWebhooks(response: ServerResponse, context: AuthIdentity | null) {
  if (!requirePermission(response, context, "webhook:read")) {
    return;
  }

  sendJson(response, 200, {
    supportedEventTypes: ["*", ...supportedEventTypes],
    webhooks: webhookRepository.listWebhooks().map((webhook) => mapWebhookResponse(webhook))
  });
}

function handleGetWebhook(
  response: ServerResponse,
  context: AuthIdentity | null,
  webhookId: string
) {
  if (!requirePermission(response, context, "webhook:read")) {
    return;
  }

  const webhook = webhookRepository.getWebhookById(webhookId);

  if (!webhook) {
    sendJson(response, 404, {
      error: {
        code: "webhook_not_found",
        message: `no webhook matched ${webhookId}`
      }
    });
    return;
  }

  sendJson(response, 200, {
    webhook: mapWebhookResponse(webhook),
    deliveries: webhookRepository.listDeliveries(webhookId)
  });
}

function handleListEvents(response: ServerResponse, requestUrl: URL, context: AuthIdentity | null) {
  if (!requirePermission(response, context, "event:read")) {
    return;
  }

  const rawType = requestUrl.searchParams.get("type");
  const eventType = rawType && isEventType(rawType) ? rawType : undefined;

  sendJson(response, 200, {
    events: eventRepository.listEvents(eventType)
  });
}

function handleGetEvent(response: ServerResponse, context: AuthIdentity | null, eventId: string) {
  if (!requirePermission(response, context, "event:read")) {
    return;
  }

  const event = eventRepository.getEvent(eventId);

  if (!event) {
    sendJson(response, 404, {
      error: {
        code: "event_not_found",
        message: `no event matched ${eventId}`
      }
    });
    return;
  }

  sendJson(response, 200, {
    event,
    deliveries: webhookRepository.listDeliveries(undefined, eventId)
  });
}

export async function handleWebhooksApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/webhooks")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/events")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/webhooks") {
    handleListWebhooks(response, context);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/webhooks") {
    await handleCreateWebhook(request, response, context);
    return true;
  }

  const webhookMatch = requestUrl.pathname.match(/^\/api\/webhooks\/([^/]+)$/);
  if (webhookMatch && request.method === "GET") {
    handleGetWebhook(response, context, webhookMatch[1]);
    return true;
  }

  if (webhookMatch && request.method === "PUT") {
    await handleUpdateWebhook(request, response, context, webhookMatch[1]);
    return true;
  }

  if (webhookMatch && request.method === "DELETE") {
    handleDeleteWebhook(response, context, webhookMatch[1]);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/events") {
    handleListEvents(response, requestUrl, context);
    return true;
  }

  const eventMatch = requestUrl.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch && request.method === "GET") {
    handleGetEvent(response, context, eventMatch[1]);
    return true;
  }

  return false;
}
