import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { resolveAccessDecision, type AccessDecision, type AuthIdentity } from "../../auth/dist/index.js";
import { defaultCoreRoles, type RoleDefinition } from "../../core-domain/dist/index.js";
import {
  createEventRecord,
  isEventType,
  supportedEventTypes,
  type EventRecord,
  type EventType
} from "../../event-core/dist/index.js";
import { createJobRecord, type JobRecord } from "../../job-core/dist/index.js";

export type WebhookPermission = "webhook:read" | "webhook:write" | "webhook:delete" | "webhook:deliver";
export type WebhookDeliveryStatus = "pending" | "success" | "failed";

export interface WebhookRecord {
  readonly id: string;
  readonly endpointUrl: string;
  readonly eventTypes: readonly (EventType | "*")[];
  readonly secret: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WebhookDeliveryRecord {
  readonly id: string;
  readonly webhookId: string;
  readonly eventId: string;
  readonly status: WebhookDeliveryStatus;
  readonly responseStatus: number | null;
  readonly errorMessage: string | null;
  readonly attemptedAt: string;
}

interface FileBackedWebhookState {
  readonly webhooks: readonly WebhookRecord[];
  readonly deliveries: readonly WebhookDeliveryRecord[];
}

const EMPTY_STATE: FileBackedWebhookState = {
  webhooks: [],
  deliveries: []
};

export interface WebhookRepository {
  saveWebhook(record: WebhookRecord): WebhookRecord;
  updateWebhook(record: WebhookRecord): WebhookRecord;
  deleteWebhook(webhookId: string): boolean;
  listWebhooks(): readonly WebhookRecord[];
  getWebhookById(webhookId: string): WebhookRecord | null;
  saveDelivery(record: WebhookDeliveryRecord): WebhookDeliveryRecord;
  listDeliveries(webhookId?: string, eventId?: string): readonly WebhookDeliveryRecord[];
}

export function createWebhookId(): string {
  return `webhook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWebhookDeliveryId(): string {
  return `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export function createWebhookRecord(input: {
  readonly id?: string;
  readonly endpointUrl: string;
  readonly eventTypes: readonly (EventType | "*")[];
  readonly secret?: string;
  readonly enabled?: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): WebhookRecord {
  const timestamp = input.createdAt ?? new Date().toISOString();

  return {
    id: input.id ?? createWebhookId(),
    endpointUrl: input.endpointUrl,
    eventTypes: input.eventTypes,
    secret: input.secret ?? createWebhookSecret(),
    enabled: input.enabled ?? true,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp
  };
}

export function createWebhookDeliveryRecord(input: {
  readonly id?: string;
  readonly webhookId: string;
  readonly eventId: string;
  readonly status: WebhookDeliveryStatus;
  readonly responseStatus: number | null;
  readonly errorMessage: string | null;
  readonly attemptedAt?: string;
}): WebhookDeliveryRecord {
  return {
    id: input.id ?? createWebhookDeliveryId(),
    webhookId: input.webhookId,
    eventId: input.eventId,
    status: input.status,
    responseStatus: input.responseStatus,
    errorMessage: input.errorMessage,
    attemptedAt: input.attemptedAt ?? new Date().toISOString()
  };
}

export function resolveWebhookAccess(
  context: AuthIdentity,
  permission: WebhookPermission,
  roles: readonly RoleDefinition[] = defaultCoreRoles
): AccessDecision {
  return resolveAccessDecision(context, roles, permission);
}

export function validateWebhookConfiguration(input: {
  readonly endpointUrl: string;
  readonly eventTypes: readonly string[];
}): { readonly valid: boolean; readonly reason: string } {
  try {
    const parsed = new URL(input.endpointUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, reason: "webhook endpoint must use http or https" };
    }
  } catch {
    return { valid: false, reason: "webhook endpoint must be a valid URL" };
  }

  if (input.eventTypes.length === 0) {
    return { valid: false, reason: "webhook must subscribe to at least one event type" };
  }

  for (const eventType of input.eventTypes) {
    if (eventType !== "*" && !isEventType(eventType)) {
      return { valid: false, reason: `unsupported webhook event type ${eventType}` };
    }
  }

  return { valid: true, reason: "webhook configuration is valid" };
}

export function webhookMatchesEvent(webhook: WebhookRecord, event: EventRecord): boolean {
  return webhook.enabled && (webhook.eventTypes.includes("*") || webhook.eventTypes.includes(event.type));
}

export function createWebhookDeliveryJob(input: {
  readonly event: EventRecord;
  readonly webhook: WebhookRecord;
  readonly createdBy: string;
}): JobRecord {
  return createJobRecord({
    type: "webhook.deliver",
    createdBy: input.createdBy,
    payload: {
      eventId: input.event.id,
      webhookId: input.webhook.id
    }
  });
}

export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function deliverWebhook(input: {
  readonly webhook: WebhookRecord;
  readonly event: EventRecord;
}): Promise<WebhookDeliveryRecord> {
  const body = JSON.stringify({
    id: input.event.id,
    type: input.event.type,
    payload: input.event.payload,
    createdAt: input.event.createdAt
  });
  const signature = signWebhookPayload(input.webhook.secret, body);
  const attemptedAt = new Date().toISOString();

  const response = await fetch(input.webhook.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-InfraLynx-Event-Id": input.event.id,
      "X-InfraLynx-Event-Type": input.event.type,
      "X-InfraLynx-Signature-Sha256": signature
    },
    body
  });

  if (!response.ok) {
    throw new Error(`webhook delivery failed with status ${response.status}`);
  }

  return createWebhookDeliveryRecord({
    webhookId: input.webhook.id,
    eventId: input.event.id,
    status: "success",
    responseStatus: response.status,
    errorMessage: null,
    attemptedAt
  });
}

export function createWebhookEvent(input: {
  readonly type: EventType;
  readonly payload: Record<string, unknown>;
}): EventRecord {
  return createEventRecord(input);
}

export class FileBackedWebhookRepository implements WebhookRepository {
  readonly #stateFilePath: string;
  #loadedState: FileBackedWebhookState | null = null;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
  }

  saveWebhook(record: WebhookRecord): WebhookRecord {
    const state = this.#loadState();
    const nextState = {
      webhooks: [...state.webhooks, record],
      deliveries: state.deliveries
    };

    this.#persistState(nextState);

    return record;
  }

  updateWebhook(record: WebhookRecord): WebhookRecord {
    const state = this.#loadState();
    const nextState = {
      webhooks: state.webhooks.map((entry) => (entry.id === record.id ? record : entry)),
      deliveries: state.deliveries
    };

    this.#persistState(nextState);

    return record;
  }

  deleteWebhook(webhookId: string): boolean {
    const state = this.#loadState();
    const nextWebhooks = state.webhooks.filter((entry) => entry.id !== webhookId);

    if (nextWebhooks.length === state.webhooks.length) {
      return false;
    }

    this.#persistState({
      webhooks: nextWebhooks,
      deliveries: state.deliveries
    });

    return true;
  }

  listWebhooks(): readonly WebhookRecord[] {
    return this.#loadState().webhooks;
  }

  getWebhookById(webhookId: string): WebhookRecord | null {
    return this.#loadState().webhooks.find((entry) => entry.id === webhookId) ?? null;
  }

  saveDelivery(record: WebhookDeliveryRecord): WebhookDeliveryRecord {
    const state = this.#loadState();
    const nextState = {
      webhooks: state.webhooks,
      deliveries: [...state.deliveries, record]
    };

    this.#persistState(nextState);

    return record;
  }

  listDeliveries(webhookId?: string, eventId?: string): readonly WebhookDeliveryRecord[] {
    return this.#loadState().deliveries.filter((entry) => {
      if (webhookId && entry.webhookId !== webhookId) {
        return false;
      }

      if (eventId && entry.eventId !== eventId) {
        return false;
      }

      return true;
    });
  }

  #loadState(): FileBackedWebhookState {
    if (this.#loadedState) {
      return this.#loadedState;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as FileBackedWebhookState;
      this.#loadedState = {
        webhooks: parsed.webhooks ?? [],
        deliveries: parsed.deliveries ?? []
      };
    } catch {
      this.#loadedState = EMPTY_STATE;
    }

    return this.#loadedState;
  }

  #persistState(state: FileBackedWebhookState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
    this.#loadedState = state;
  }
}

export function createFileBackedWebhookRepository(stateFilePath: string): WebhookRepository {
  return new FileBackedWebhookRepository(stateFilePath);
}

export { supportedEventTypes };
