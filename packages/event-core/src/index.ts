import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type EventType =
  | "inventory.site.created"
  | "inventory.site.updated"
  | "inventory.site.deleted"
  | "inventory.rack.created"
  | "inventory.rack.updated"
  | "inventory.rack.deleted"
  | "inventory.device.created"
  | "inventory.device.updated"
  | "inventory.device.deleted"
  | "inventory.prefix.created"
  | "inventory.prefix.updated"
  | "inventory.prefix.deleted"
  | "inventory.ip-address.created"
  | "inventory.ip-address.updated"
  | "inventory.ip-address.deleted"
  | "job.created"
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted";

export interface EventRecord {
  readonly id: string;
  readonly type: EventType;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

interface FileBackedEventState {
  readonly events: readonly EventRecord[];
}

const EMPTY_STATE: FileBackedEventState = {
  events: []
};

export const supportedEventTypes: readonly EventType[] = [
  "inventory.site.created",
  "inventory.site.updated",
  "inventory.site.deleted",
  "inventory.rack.created",
  "inventory.rack.updated",
  "inventory.rack.deleted",
  "inventory.device.created",
  "inventory.device.updated",
  "inventory.device.deleted",
  "inventory.prefix.created",
  "inventory.prefix.updated",
  "inventory.prefix.deleted",
  "inventory.ip-address.created",
  "inventory.ip-address.updated",
  "inventory.ip-address.deleted",
  "job.created",
  "webhook.created",
  "webhook.updated",
  "webhook.deleted"
] as const;

export interface EventRepository {
  saveEvent(event: EventRecord): EventRecord;
  listEvents(type?: EventType): readonly EventRecord[];
  getEvent(eventId: string): EventRecord | null;
}

export function createEventId(): string {
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEventRecord(input: {
  readonly id?: string;
  readonly type: EventType;
  readonly payload: Record<string, unknown>;
  readonly createdAt?: string;
}): EventRecord {
  return {
    id: input.id ?? createEventId(),
    type: input.type,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function isEventType(value: string): value is EventType {
  return supportedEventTypes.includes(value as EventType);
}

export function describeEvent(event: EventRecord): string {
  return `${event.type} emitted at ${event.createdAt}`;
}

export class FileBackedEventRepository implements EventRepository {
  readonly #stateFilePath: string;
  #loadedState: FileBackedEventState | null = null;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
  }

  saveEvent(event: EventRecord): EventRecord {
    const state = this.#loadState();
    const nextState = {
      events: [...state.events, event]
    };

    this.#persistState(nextState);

    return event;
  }

  listEvents(type?: EventType): readonly EventRecord[] {
    return this.#loadState().events.filter((event) => (type ? event.type === type : true));
  }

  getEvent(eventId: string): EventRecord | null {
    return this.#loadState().events.find((event) => event.id === eventId) ?? null;
  }

  #loadState(): FileBackedEventState {
    if (this.#loadedState) {
      return this.#loadedState;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as FileBackedEventState;
      this.#loadedState = {
        events: parsed.events ?? []
      };
    } catch {
      this.#loadedState = EMPTY_STATE;
    }

    return this.#loadedState;
  }

  #persistState(state: FileBackedEventState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
    this.#loadedState = state;
  }
}

export function createFileBackedEventRepository(stateFilePath: string): EventRepository {
  return new FileBackedEventRepository(stateFilePath);
}
