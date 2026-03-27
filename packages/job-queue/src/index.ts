import {
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import RedisMock from "ioredis-mock";
import {
  Job as BullJob,
  Queue,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
  type Processor
} from "bullmq";

import {
  createJobLog,
  defaultJobRetryPolicy,
  markJobSucceeded,
  registerJobFailure,
  type JobFailureTransition,
  type JobLogRecord,
  type JobRecord
} from "../../job-core/dist/index.js";

interface FileBackedJobState {
  readonly jobs: readonly JobRecord[];
  readonly logs: readonly JobLogRecord[];
}

export interface JobQueueStore {
  enqueue(job: JobRecord): JobRecord;
  leaseNextPendingJob(timestamp?: string): JobRecord | null;
  saveJob(job: JobRecord): JobRecord;
  appendLogs(logs: readonly JobLogRecord[]): readonly JobLogRecord[];
  getJob(jobId: string): JobRecord | null;
  listJobs(status?: JobRecord["status"]): readonly JobRecord[];
  listLogs(jobId: string): readonly JobLogRecord[];
}

export interface BullMqWorkerOptions {
  readonly concurrency?: number;
  readonly processor: (job: JobRecord) => Promise<Record<string, unknown>>;
}

const EMPTY_STATE: FileBackedJobState = {
  jobs: [],
  logs: []
};

const queueName = "infralynx-platform-jobs";
const require = createRequire(import.meta.url);
const IORedis = require("ioredis") as new (...args: any[]) => any;

type RedisConnection = any;

let sharedConnection: RedisConnection | null = null;
let sharedQueue: Queue<Record<string, unknown>> | null = null;

function sleep(milliseconds: number) {
  const start = Date.now();

  while (Date.now() - start < milliseconds) {
    // Intentional synchronous wait to keep file updates atomic in the metadata adapter.
  }
}

function getBullMqConnection(): RedisConnection {
  if (sharedConnection) {
    return sharedConnection;
  }

  const redisUrl = process.env["INFRALYNX_REDIS_URL"];

  sharedConnection = redisUrl
    ? new IORedis(redisUrl, {
        maxRetriesPerRequest: null
      })
    : new RedisMock();

  return sharedConnection;
}

function getQueue(): Queue<Record<string, unknown>> {
  if (sharedQueue) {
    return sharedQueue;
  }

  sharedQueue = new Queue(queueName, {
    connection: getBullMqConnection() as unknown as ConnectionOptions
  });

  return sharedQueue;
}

function toBullMqJobOptions(job: JobRecord): JobsOptions {
  return {
    jobId: job.id,
    attempts: defaultJobRetryPolicy.maxRetries + 1,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: false,
    removeOnFail: false
  };
}

export class FileBackedJobQueueStore implements JobQueueStore {
  readonly #stateFilePath: string;
  readonly #lockPath: string;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
    this.#lockPath = `${stateFilePath}.lock`;
  }

  enqueue(job: JobRecord): JobRecord {
    const queuedJob = this.#withLockedState((state) => ({
      nextState: {
        jobs: [...state.jobs.filter((entry) => entry.id !== job.id), job],
        logs: [...state.logs, createJobLog(job.id, "info", `queued ${job.type}`, job.createdAt)]
      },
      result: job
    }));

    void getQueue()
      .add(job.type, job.payload, toBullMqJobOptions(job))
      .catch((error) => {
        this.appendLogs([
          createJobLog(
            job.id,
            "error",
            error instanceof Error ? `queue enqueue failed: ${error.message}` : "queue enqueue failed"
          )
        ]);
      });

    return queuedJob;
  }

  leaseNextPendingJob(timestamp = new Date().toISOString()): JobRecord | null {
    return this.#withLockedState((state) => {
      const nextJob = state.jobs
        .filter((job) => job.status === "pending")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];

      if (!nextJob) {
        return {
          nextState: state,
          result: null
        };
      }

      const leasedJob = {
        ...nextJob,
        status: "running" as const,
        updatedAt: timestamp
      };

      return {
        nextState: {
          jobs: state.jobs.map((job) => (job.id === nextJob.id ? leasedJob : job)),
          logs: [
            ...state.logs,
            createJobLog(nextJob.id, "info", `leased ${nextJob.type}`, timestamp)
          ]
        },
        result: leasedJob
      };
    });
  }

  saveJob(job: JobRecord): JobRecord {
    return this.#withLockedState((state) => ({
      nextState: {
        jobs: state.jobs.map((existing) => (existing.id === job.id ? job : existing)),
        logs: state.logs
      },
      result: job
    }));
  }

  appendLogs(logs: readonly JobLogRecord[]): readonly JobLogRecord[] {
    return this.#withLockedState((state) => ({
      nextState: {
        jobs: state.jobs,
        logs: [...state.logs, ...logs]
      },
      result: logs
    }));
  }

  getJob(jobId: string): JobRecord | null {
    return this.#loadState().jobs.find((job) => job.id === jobId) ?? null;
  }

  listJobs(status?: JobRecord["status"]): readonly JobRecord[] {
    return this.#loadState().jobs.filter((job) => (status ? job.status === status : true));
  }

  listLogs(jobId: string): readonly JobLogRecord[] {
    return this.#loadState().logs.filter((log) => log.jobId === jobId);
  }

  #withLockedState<TResult>(callback: (state: FileBackedJobState) => {
    readonly nextState: FileBackedJobState;
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

    throw new Error("unable to acquire job queue metadata lock");
  }

  #releaseLock() {
    try {
      unlinkSync(this.#lockPath);
    } catch {
      // Lock cleanup should not block callers once state changes are persisted.
    }
  }

  #loadState(): FileBackedJobState {
    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as FileBackedJobState;

      return {
        jobs: parsed.jobs ?? [],
        logs: parsed.logs ?? []
      };
    } catch {
      return EMPTY_STATE;
    }
  }

  #persistState(state: FileBackedJobState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
  }
}

export function createFileBackedJobQueueStore(stateFilePath: string) {
  return new FileBackedJobQueueStore(stateFilePath);
}

export function createBullMqJobWorker(
  stateFilePath: string,
  options: BullMqWorkerOptions
) {
  const metadataStore = createFileBackedJobQueueStore(stateFilePath);

  const processor: Processor<Record<string, unknown>, Record<string, unknown>, string> = async (bullJob) => {
    const current = metadataStore.getJob(bullJob.id ?? "") ?? {
      id: bullJob.id ?? `job-${Date.now().toString(36)}`,
      type: bullJob.name,
      status: "pending" as const,
      payload: bullJob.data,
      result: null,
      retryCount: Math.max(bullJob.attemptsMade - 1, 0),
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const running: JobRecord = {
      ...current,
      status: "running",
      retryCount: bullJob.attemptsMade,
      updatedAt: new Date().toISOString()
    };

    metadataStore.saveJob(running);
    metadataStore.appendLogs([
      createJobLog(running.id, "info", `worker started ${running.type}`, running.updatedAt)
    ]);

    try {
      const result = await options.processor(running);
      const completed = markJobSucceeded(running, result, new Date().toISOString());

      metadataStore.saveJob(completed);
      metadataStore.appendLogs([
        createJobLog(completed.id, "info", `worker completed ${completed.type}`, completed.updatedAt)
      ]);

      return result;
    } catch (error) {
      const failure = registerJobFailure(
        running,
        error instanceof Error ? error.message : "unknown worker error",
        defaultJobRetryPolicy,
        new Date().toISOString()
      );

      metadataStore.saveJob(failure.job);
      metadataStore.appendLogs([
        ...appendFailureLogs(failure, failure.job.updatedAt)
      ]);

      throw error;
    }
  };

  return new Worker(queueName, processor, {
    connection: getBullMqConnection() as unknown as ConnectionOptions,
    concurrency: options.concurrency ?? 1
  });
}

export function resetFileBackedJobQueueStore(stateFilePath: string) {
  rmSync(stateFilePath, { force: true });
  rmSync(`${stateFilePath}.lock`, { force: true });
}

export function appendFailureLogs(
  transition: JobFailureTransition,
  timestamp = new Date().toISOString()
): readonly JobLogRecord[] {
  return [
    createJobLog(
      transition.job.id,
      transition.willRetry ? "warn" : "error",
      transition.willRetry ? "job failed and was returned to BullMQ" : "job failed permanently",
      timestamp
    )
  ];
}

export async function obliterateBullMqQueue() {
  await getQueue().obliterate({ force: true });
}
