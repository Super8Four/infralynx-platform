import {
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

import {
  createJobLog,
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

const EMPTY_STATE: FileBackedJobState = {
  jobs: [],
  logs: []
};

function sleep(milliseconds: number) {
  const start = Date.now();

  while (Date.now() - start < milliseconds) {
    // Intentional synchronous wait to keep lock acquisition simple in the file-backed bootstrap adapter.
  }
}

export class FileBackedJobQueueStore implements JobQueueStore {
  readonly #stateFilePath: string;
  readonly #lockPath: string;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
    this.#lockPath = `${stateFilePath}.lock`;
  }

  enqueue(job: JobRecord): JobRecord {
    return this.#withLockedState((state) => ({
      nextState: {
        jobs: [...state.jobs, job],
        logs: [...state.logs, createJobLog(job.id, "info", `queued ${job.type}`, job.createdAt)]
      },
      result: job
    }));
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
            createJobLog(nextJob.id, "info", `worker leased job ${nextJob.type}`, timestamp)
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

    throw new Error("unable to acquire job queue state lock");
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
      transition.willRetry ? "job failed and was returned to the queue" : "job failed permanently",
      timestamp
    )
  ];
}
