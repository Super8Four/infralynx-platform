import { createAuditRecord, summarizeAuditRecord } from "../../audit/dist/index.js";

export type JobStatus = "pending" | "running" | "success" | "failed";
export type JobLogLevel = "debug" | "info" | "warn" | "error";

export interface JobRecord {
  readonly id: string;
  readonly type: string;
  readonly status: JobStatus;
  readonly payload: Record<string, unknown>;
  readonly result: Record<string, unknown> | null;
  readonly retryCount: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobLogRecord {
  readonly jobId: string;
  readonly message: string;
  readonly level: JobLogLevel;
  readonly timestamp: string;
}

export interface JobRetryPolicy {
  readonly maxRetries: number;
}

export interface JobFailureTransition {
  readonly job: JobRecord;
  readonly willRetry: boolean;
}

export const defaultJobRetryPolicy: JobRetryPolicy = {
  maxRetries: 2
};

export function createJobId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createJobRecord(input: {
  readonly id?: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdBy: string;
  readonly createdAt?: string;
}): JobRecord {
  const timestamp = input.createdAt ?? new Date().toISOString();

  return {
    id: input.id ?? createJobId(),
    type: input.type,
    status: "pending",
    payload: input.payload,
    result: null,
    retryCount: 0,
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createJobLog(
  jobId: string,
  level: JobLogLevel,
  message: string,
  timestamp = new Date().toISOString()
): JobLogRecord {
  return {
    jobId,
    message,
    level,
    timestamp
  };
}

export function markJobRunning(job: JobRecord, timestamp = new Date().toISOString()): JobRecord {
  return {
    ...job,
    status: "running",
    updatedAt: timestamp
  };
}

export function markJobSucceeded(
  job: JobRecord,
  result: Record<string, unknown>,
  timestamp = new Date().toISOString()
): JobRecord {
  return {
    ...job,
    status: "success",
    result,
    updatedAt: timestamp
  };
}

export function registerJobFailure(
  job: JobRecord,
  errorMessage: string,
  retryPolicy: JobRetryPolicy = defaultJobRetryPolicy,
  timestamp = new Date().toISOString()
): JobFailureTransition {
  const nextRetryCount = job.retryCount + 1;
  const willRetry = nextRetryCount <= retryPolicy.maxRetries;

  return {
    willRetry,
    job: {
      ...job,
      status: willRetry ? "pending" : "failed",
      result: {
        error: errorMessage,
        retryScheduled: willRetry
      },
      retryCount: nextRetryCount,
      updatedAt: timestamp
    }
  };
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "success" || status === "failed";
}

export function createJobAuditSummary(
  job: JobRecord,
  action: "job.created" | "job.started" | "job.succeeded" | "job.failed"
): string {
  const record = createAuditRecord({
    occurredAt: job.updatedAt,
    category: "authorization",
    action,
    actor: {
      id: job.createdBy,
      type: "user",
      tenantId: null
    },
    targetId: job.id,
    metadata: {
      jobType: job.type,
      status: job.status
    }
  });

  return summarizeAuditRecord(record);
}
