import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type AuditActorType = "user" | "service-account" | "system";

export type AuditObjectType =
  | "auth-provider"
  | "session"
  | "login"
  | "role-assignment"
  | "provider-role-mapping"
  | "site"
  | "rack"
  | "device"
  | "prefix"
  | "ip-address"
  | "job"
  | "job-log"
  | "webhook"
  | "event"
  | "audit";

export interface AuditActor {
  readonly id: string;
  readonly type: AuditActorType;
  readonly tenantId: string | null;
}

export interface AuditRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly actorType: AuditActorType;
  readonly tenantId: string | null;
  readonly action: string;
  readonly objectType: AuditObjectType | string;
  readonly objectId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly timestamp: string;
}

export interface AuditQuery {
  readonly userId?: string;
  readonly action?: string;
  readonly objectType?: string;
  readonly objectId?: string;
  readonly tenantId?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
}

type StructuredAuditInput = {
  readonly userId: string | null;
  readonly actorType: AuditActorType;
  readonly tenantId: string | null;
  readonly action: string;
  readonly objectType: AuditObjectType | string;
  readonly objectId: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: string;
  readonly id?: string;
};

type LegacyAuditInput = {
  readonly occurredAt: string;
  readonly category: string;
  readonly action: string;
  readonly actor: AuditActor;
  readonly targetId: string | null;
  readonly metadata: Record<string, string>;
};

function isLegacyAuditInput(input: StructuredAuditInput | LegacyAuditInput): input is LegacyAuditInput {
  return "occurredAt" in input && "actor" in input;
}

export function createAuditRecord(input: StructuredAuditInput | LegacyAuditInput): AuditRecord {
  if (isLegacyAuditInput(input)) {
    return {
      id: `audit-${input.category}:${input.action}:${input.occurredAt}`,
      userId: input.actor.id,
      actorType: input.actor.type,
      tenantId: input.actor.tenantId,
      action: `${input.category}.${input.action}`,
      objectType: input.category,
      objectId: input.targetId,
      metadata: input.metadata,
      timestamp: input.occurredAt
    };
  }

  return {
    id: input.id ?? `audit-${randomUUID()}`,
    userId: input.userId,
    actorType: input.actorType,
    tenantId: input.tenantId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    metadata: input.metadata ?? {},
    timestamp: input.timestamp ?? new Date().toISOString()
  };
}

export function summarizeAuditRecord(record: AuditRecord): string {
  return `${record.timestamp} ${record.action} ${record.objectType}:${record.objectId ?? "none"} by ${record.actorType}`;
}

interface AuditRepositoryState {
  readonly records: readonly AuditRecord[];
}

function createDefaultState(): AuditRepositoryState {
  return { records: [] };
}

export class FileBackedAuditRepository {
  readonly #stateFilePath: string;
  #state: AuditRepositoryState | null = null;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
  }

  append(record: AuditRecord): AuditRecord {
    const state = this.#loadState();
    const nextState = {
      records: [...state.records, record].sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    };
    this.#persistState(nextState);
    return record;
  }

  getById(recordId: string): AuditRecord | null {
    return this.#loadState().records.find((record) => record.id === recordId) ?? null;
  }

  query(query: AuditQuery = {}): readonly AuditRecord[] {
    const sinceTime = query.since ? new Date(query.since).getTime() : null;
    const untilTime = query.until ? new Date(query.until).getTime() : null;
    const limit = query.limit && query.limit > 0 ? query.limit : 100;

    return this.#loadState().records
      .filter((record) => (query.userId ? record.userId === query.userId : true))
      .filter((record) => (query.action ? record.action === query.action : true))
      .filter((record) => (query.objectType ? record.objectType === query.objectType : true))
      .filter((record) => (query.objectId ? record.objectId === query.objectId : true))
      .filter((record) => (query.tenantId ? record.tenantId === query.tenantId : true))
      .filter((record) => (sinceTime !== null ? new Date(record.timestamp).getTime() >= sinceTime : true))
      .filter((record) => (untilTime !== null ? new Date(record.timestamp).getTime() <= untilTime : true))
      .slice(0, limit);
  }

  listRecent(limit = 100): readonly AuditRecord[] {
    return this.query({ limit });
  }

  #loadState(): AuditRepositoryState {
    if (this.#state) {
      return this.#state;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as Partial<AuditRepositoryState>;
      this.#state = { records: parsed.records ?? [] };
    } catch {
      this.#state = createDefaultState();
      this.#persistState(this.#state);
    }

    return this.#state;
  }

  #persistState(state: AuditRepositoryState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
    this.#state = state;
  }
}

export function createFileBackedAuditRepository(stateFilePath: string) {
  return new FileBackedAuditRepository(stateFilePath);
}

export function resetFileBackedAuditRepository(stateFilePath: string) {
  if (existsSync(stateFilePath)) {
    writeFileSync(stateFilePath, JSON.stringify(createDefaultState(), null, 2));
  }
}
