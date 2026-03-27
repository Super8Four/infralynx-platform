import {
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

import cron from "node-cron";

import { createJobLog, createJobRecord, type JobLogRecord, type JobRecord } from "../../job-core/dist/index.js";
import type { JobQueueStore } from "../../job-queue/dist/index.js";

export interface ScheduleRecord {
  readonly id: string;
  readonly name: string;
  readonly cronExpression: string;
  readonly timezone: string;
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly enabled: boolean;
  readonly lastRun: string | null;
  readonly nextRun: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScheduleLogRecord {
  readonly scheduleId: string;
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp: string;
}

interface ScheduleState {
  readonly schedules: readonly ScheduleRecord[];
  readonly logs: readonly ScheduleLogRecord[];
}

interface ParsedCronField {
  readonly values: readonly number[];
}

export interface ParsedCronExpression {
  readonly minute: ParsedCronField;
  readonly hour: ParsedCronField;
  readonly dayOfMonth: ParsedCronField;
  readonly month: ParsedCronField;
  readonly dayOfWeek: ParsedCronField;
}

export interface CronValidationResult {
  readonly valid: boolean;
  readonly reason: string;
  readonly parsed: ParsedCronExpression | null;
}

export interface ScheduleDueResult {
  readonly enqueuedJobs: readonly JobRecord[];
  readonly updatedSchedules: readonly ScheduleRecord[];
  readonly logs: readonly ScheduleLogRecord[];
}

export interface SchedulerStore {
  createSchedule(input: Omit<ScheduleRecord, "id" | "lastRun" | "nextRun" | "createdAt" | "updatedAt"> & {
    readonly id?: string;
    readonly createdAt?: string;
  }): ScheduleRecord;
  updateSchedule(scheduleId: string, patch: Partial<Omit<ScheduleRecord, "id" | "createdAt" | "createdBy">>): ScheduleRecord | null;
  deleteSchedule(scheduleId: string): boolean;
  getSchedule(scheduleId: string): ScheduleRecord | null;
  listSchedules(): readonly ScheduleRecord[];
  listLogs(scheduleId?: string): readonly ScheduleLogRecord[];
  runDueSchedules(queue: JobQueueStore, timestamp?: string): ScheduleDueResult;
}

export interface SchedulerRuntime {
  stop(): void;
}

const EMPTY_STATE: ScheduleState = {
  schedules: [],
  logs: []
};

function sleep(milliseconds: number) {
  const start = Date.now();

  while (Date.now() - start < milliseconds) {
    // Intentional synchronous wait to keep lock acquisition aligned with other file-backed adapters.
  }
}

function createScheduleId(): string {
  return `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createScheduleLog(
  scheduleId: string,
  level: "info" | "warn" | "error",
  message: string,
  timestamp = new Date().toISOString()
): ScheduleLogRecord {
  return {
    scheduleId,
    level,
    message,
    timestamp
  };
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  return Number(value);
}

function parseCronFieldPart(part: string, min: number, max: number): readonly number[] | null {
  if (part === "*") {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }

  const stepMatch = part.match(/^\*\/(\d+)$/);

  if (stepMatch) {
    const step = parseInteger(stepMatch[1]);

    if (!step || step <= 0) {
      return null;
    }

    const values: number[] = [];

    for (let current = min; current <= max; current += step) {
      values.push(current);
    }

    return values;
  }

  const rangeMatch = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);

  if (rangeMatch) {
    const start = parseInteger(rangeMatch[1]);
    const end = parseInteger(rangeMatch[2]);
    const step = rangeMatch[3] ? parseInteger(rangeMatch[3]) : 1;

    if (
      start === null ||
      end === null ||
      step === null ||
      start < min ||
      end > max ||
      start > end ||
      step <= 0
    ) {
      return null;
    }

    const values: number[] = [];

    for (let current = start; current <= end; current += step) {
      values.push(current);
    }

    return values;
  }

  const numericValue = parseInteger(part);

  if (numericValue === null || numericValue < min || numericValue > max) {
    return null;
  }

  return [numericValue];
}

function parseCronField(field: string, min: number, max: number): ParsedCronField | null {
  const parts = field.split(",").map((value) => value.trim()).filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const values = new Set<number>();

  for (const part of parts) {
    const parsed = parseCronFieldPart(part, min, max);

    if (!parsed) {
      return null;
    }

    for (const value of parsed) {
      values.add(value);
    }
  }

  return {
    values: [...values].sort((left, right) => left - right)
  };
}

export function validateCronExpression(expression: string): CronValidationResult {
  const trimmedExpression = expression.trim();

  if (!cron.validate(trimmedExpression)) {
    return {
      valid: false,
      reason: "cron expression contains unsupported values or ranges",
      parsed: null
    };
  }

  const segments = trimmedExpression.split(/\s+/);

  if (segments.length !== 5) {
    return {
      valid: false,
      reason: "cron expressions must contain minute, hour, day-of-month, month, and day-of-week fields",
      parsed: null
    };
  }

  const minute = parseCronField(segments[0], 0, 59);
  const hour = parseCronField(segments[1], 0, 23);
  const dayOfMonth = parseCronField(segments[2], 1, 31);
  const month = parseCronField(segments[3], 1, 12);
  const dayOfWeek = parseCronField(segments[4], 0, 6);

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return {
      valid: false,
      reason: "cron expression contains unsupported values or ranges",
      parsed: null
    };
  }

  return {
    valid: true,
    reason: "cron expression is valid",
    parsed: {
      minute,
      hour,
      dayOfMonth,
      month,
      dayOfWeek
    }
  };
}

function matchesField(parsed: ParsedCronField, value: number): boolean {
  return parsed.values.includes(value);
}

export function matchesCronExpression(parsed: ParsedCronExpression, date: Date): boolean {
  return (
    matchesField(parsed.minute, date.getUTCMinutes()) &&
    matchesField(parsed.hour, date.getUTCHours()) &&
    matchesField(parsed.dayOfMonth, date.getUTCDate()) &&
    matchesField(parsed.month, date.getUTCMonth() + 1) &&
    matchesField(parsed.dayOfWeek, date.getUTCDay())
  );
}

export function calculateNextRun(
  expression: string,
  afterTimestamp: string,
  timezone = "UTC"
): string | null {
  if (timezone !== "UTC") {
    return null;
  }

  const validation = validateCronExpression(expression);

  if (!validation.valid || !validation.parsed) {
    return null;
  }

  const base = new Date(afterTimestamp);

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const cursor = new Date(base.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let step = 0; step < 60 * 24 * 366; step += 1) {
    if (matchesCronExpression(validation.parsed, cursor)) {
      return cursor.toISOString();
    }

    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  return null;
}

export function validateScheduleInput(input: {
  readonly name: string;
  readonly cronExpression: string;
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly timezone?: string;
}): { readonly valid: boolean; readonly reason: string } {
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return {
      valid: false,
      reason: "schedule name must be a non-empty string"
    };
  }

  if (typeof input.jobType !== "string" || input.jobType.trim().length === 0) {
    return {
      valid: false,
      reason: "schedule job type must be a non-empty string"
    };
  }

  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    return {
      valid: false,
      reason: "schedule payload must be a JSON object"
    };
  }

  const timezone = input.timezone ?? "UTC";

  if (timezone !== "UTC") {
    return {
      valid: false,
      reason: "the bootstrap scheduler currently supports UTC schedules only"
    };
  }

  const cronValidation = validateCronExpression(input.cronExpression);

  return {
    valid: cronValidation.valid,
    reason: cronValidation.reason
  };
}

export class FileBackedSchedulerStore implements SchedulerStore {
  readonly #stateFilePath: string;
  readonly #lockPath: string;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
    this.#lockPath = `${stateFilePath}.lock`;
  }

  createSchedule(
    input: Omit<ScheduleRecord, "id" | "lastRun" | "nextRun" | "createdAt" | "updatedAt"> & {
      readonly id?: string;
      readonly createdAt?: string;
    }
  ): ScheduleRecord {
    const timestamp = input.createdAt ?? new Date().toISOString();
    const nextRun =
      input.enabled === false ? null : calculateNextRun(input.cronExpression, timestamp, input.timezone);
    const schedule: ScheduleRecord = {
      id: input.id ?? createScheduleId(),
      name: input.name,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      jobType: input.jobType,
      payload: input.payload,
      enabled: input.enabled,
      lastRun: null,
      nextRun,
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return this.#withLockedState((state) => ({
      nextState: {
        schedules: [...state.schedules, schedule],
        logs: [...state.logs, createScheduleLog(schedule.id, "info", `created schedule ${schedule.name}`, timestamp)]
      },
      result: schedule
    }));
  }

  updateSchedule(
    scheduleId: string,
    patch: Partial<Omit<ScheduleRecord, "id" | "createdAt" | "createdBy">>
  ): ScheduleRecord | null {
    return this.#withLockedState((state) => {
      const existing = state.schedules.find((schedule) => schedule.id === scheduleId);

      if (!existing) {
        return {
          nextState: state,
          result: null
        };
      }

      const timestamp = new Date().toISOString();
      const merged: ScheduleRecord = {
        ...existing,
        ...patch,
        updatedAt: timestamp,
        nextRun:
          patch.enabled === false || (patch.enabled ?? existing.enabled) === false
            ? null
            : calculateNextRun(
                patch.cronExpression ?? existing.cronExpression,
                existing.lastRun ?? timestamp,
                patch.timezone ?? existing.timezone
              )
      };

      return {
        nextState: {
          schedules: state.schedules.map((schedule) => (schedule.id === scheduleId ? merged : schedule)),
          logs: [...state.logs, createScheduleLog(scheduleId, "info", `updated schedule ${merged.name}`, timestamp)]
        },
        result: merged
      };
    });
  }

  deleteSchedule(scheduleId: string): boolean {
    return this.#withLockedState((state) => {
      const existing = state.schedules.find((schedule) => schedule.id === scheduleId);

      if (!existing) {
        return {
          nextState: state,
          result: false
        };
      }

      const timestamp = new Date().toISOString();

      return {
        nextState: {
          schedules: state.schedules.filter((schedule) => schedule.id !== scheduleId),
          logs: [...state.logs, createScheduleLog(scheduleId, "warn", `deleted schedule ${existing.name}`, timestamp)]
        },
        result: true
      };
    });
  }

  getSchedule(scheduleId: string): ScheduleRecord | null {
    return this.#loadState().schedules.find((schedule) => schedule.id === scheduleId) ?? null;
  }

  listSchedules(): readonly ScheduleRecord[] {
    return [...this.#loadState().schedules].sort((left, right) => left.name.localeCompare(right.name));
  }

  listLogs(scheduleId?: string): readonly ScheduleLogRecord[] {
    const logs = this.#loadState().logs;
    return scheduleId ? logs.filter((log) => log.scheduleId === scheduleId) : logs;
  }

  runDueSchedules(queue: JobQueueStore, timestamp = new Date().toISOString()): ScheduleDueResult {
    return this.#withLockedState((state) => {
      const dueSchedules = state.schedules
        .filter((schedule) => schedule.enabled && schedule.nextRun !== null && schedule.nextRun <= timestamp)
        .sort((left, right) => (left.nextRun ?? "").localeCompare(right.nextRun ?? ""));

      if (dueSchedules.length === 0) {
        return {
          nextState: state,
          result: {
            enqueuedJobs: [],
            updatedSchedules: [],
            logs: []
          }
        };
      }

      const enqueuedJobs: JobRecord[] = [];
      const scheduleLogs: ScheduleLogRecord[] = [];
      const updatedScheduleMap = new Map<string, ScheduleRecord>();

      for (const schedule of dueSchedules) {
        const job = queue.enqueue(
          createJobRecord({
            type: schedule.jobType,
            payload: {
              ...schedule.payload,
              scheduleId: schedule.id,
              scheduledFor: schedule.nextRun
            },
            createdBy: `scheduler:${schedule.id}`,
            createdAt: timestamp
          })
        );
        const nextRun = calculateNextRun(schedule.cronExpression, timestamp, schedule.timezone);
        const updatedSchedule: ScheduleRecord = {
          ...schedule,
          lastRun: timestamp,
          nextRun,
          updatedAt: timestamp
        };

        enqueuedJobs.push(job);
        updatedScheduleMap.set(schedule.id, updatedSchedule);
        scheduleLogs.push(
          createScheduleLog(schedule.id, "info", `triggered ${schedule.jobType} as ${job.id}`, timestamp)
        );
      }

      const nextState: ScheduleState = {
        schedules: state.schedules.map((schedule) => updatedScheduleMap.get(schedule.id) ?? schedule),
        logs: [...state.logs, ...scheduleLogs]
      };

      return {
        nextState,
        result: {
          enqueuedJobs,
          updatedSchedules: [...updatedScheduleMap.values()],
          logs: scheduleLogs
        }
      };
    });
  }

  #withLockedState<TResult>(callback: (state: ScheduleState) => {
    readonly nextState: ScheduleState;
    readonly result: TResult;
  }): TResult {
    this.#acquireLock();

    try {
      const outcome = callback(this.#loadState());
      this.#persistState(outcome.nextState);

      return outcome.result;
    } finally {
      this.#releaseLock();
    }
  }

  #acquireLock() {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        writeFileSync(this.#lockPath, String(process.pid), { flag: "wx" });
        return;
      } catch {
        sleep(25);
      }
    }

    throw new Error("unable to acquire scheduler state lock");
  }

  #releaseLock() {
    try {
      unlinkSync(this.#lockPath);
    } catch {
      // Lock cleanup should not block callers.
    }
  }

  #loadState(): ScheduleState {
    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as ScheduleState;
      return {
        schedules: parsed.schedules ?? [],
        logs: parsed.logs ?? []
      };
    } catch {
      return EMPTY_STATE;
    }
  }

  #persistState(state: ScheduleState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
  }
}

export function createFileBackedSchedulerStore(stateFilePath: string): SchedulerStore {
  return new FileBackedSchedulerStore(stateFilePath);
}

export function resetFileBackedSchedulerStore(stateFilePath: string) {
  rmSync(stateFilePath, { force: true });
  rmSync(`${stateFilePath}.lock`, { force: true });
}

export function createSchedulerJobLogs(
  scheduleId: string,
  enqueuedJobs: readonly JobRecord[],
  timestamp = new Date().toISOString()
): readonly JobLogRecord[] {
  return enqueuedJobs.map((job) =>
    createJobLog(job.id, "info", `scheduler triggered ${job.type} from ${scheduleId}`, timestamp)
  );
}

export function startSchedulerRuntime(
  store: SchedulerStore,
  queue: JobQueueStore
): SchedulerRuntime {
  const tasks = store
    .listSchedules()
    .filter((schedule) => schedule.enabled)
    .map((schedule) =>
      cron.schedule(
        schedule.cronExpression,
        () => {
          const timestamp = new Date().toISOString();
          const job = queue.enqueue(
            createJobRecord({
              type: schedule.jobType,
              payload: {
                ...schedule.payload,
                scheduleId: schedule.id,
                scheduledFor: timestamp
              },
              createdBy: `scheduler:${schedule.id}`,
              createdAt: timestamp
            })
          );

          store.updateSchedule(schedule.id, {
            lastRun: timestamp,
            nextRun: calculateNextRun(schedule.cronExpression, timestamp, schedule.timezone)
          });
          queue.appendLogs(createSchedulerJobLogs(schedule.id, [job], timestamp));
        },
        {
          timezone: schedule.timezone
        }
      )
    );

  return {
    stop() {
      for (const task of tasks) {
        task.stop();
        task.destroy();
      }
    }
  };
}
