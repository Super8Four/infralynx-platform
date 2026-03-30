import { resolve } from "node:path";

import {
  createAuditRecord,
  createFileBackedAuditRepository
} from "../../../../packages/audit/dist/index.js";
import { workspaceMetadata } from "../../../../packages/config/dist/index.js";
import {
  createFileBackedJobQueueStore,
  createBullMqJobWorker
} from "../../../../packages/job-queue/dist/index.js";
import {
  createFileBackedSchedulerStore,
  createSchedulerJobLogs,
  startSchedulerRuntime
} from "../../../../packages/scheduler/dist/index.js";
import { platformBoundaries } from "../../../../packages/domain-core/dist/index.js";
import { jobHandlers } from "./handlers.js";

const jobsStateFilePath = resolve(process.cwd(), "runtime-data/jobs/queue-state.json");
const schedulerStateFilePath = resolve(process.cwd(), "runtime-data/scheduler/state.json");
const auditStateFilePath = resolve(process.cwd(), "runtime-data/audit/state.json");

export interface WorkerCycleResult {
  readonly handled: boolean;
  readonly jobId: string | null;
  readonly status: "idle" | "success" | "retrying" | "failed";
}

const queue = createFileBackedJobQueueStore(jobsStateFilePath);
const schedulerStore = createFileBackedSchedulerStore(schedulerStateFilePath);
const auditRepository = createFileBackedAuditRepository(auditStateFilePath);

function delay(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function describeWorkerRuntime(): string {
  return `${workspaceMetadata.name} worker boundary: ${platformBoundaries.worker}`;
}

function appendWorkerAudit(input: {
  readonly jobId: string;
  readonly createdBy: string | null;
  readonly action: string;
  readonly type: string;
  readonly status: string;
  readonly retryCount?: number;
}) {
  auditRepository.append(
    createAuditRecord({
      userId: input.createdBy,
      actorType: "system",
      tenantId: null,
      action: input.action,
      objectType: "job",
      objectId: input.jobId,
      metadata: {
        type: input.type,
        status: input.status,
        retryCount: input.retryCount ?? 0
      }
    })
  );
}

export function runSchedulerCycle(timestamp = new Date().toISOString()) {
  const dueResult = schedulerStore.runDueSchedules(queue, timestamp);

  if (dueResult.enqueuedJobs.length > 0) {
    queue.appendLogs(
      dueResult.updatedSchedules.flatMap((schedule) =>
        createSchedulerJobLogs(
          schedule.id,
          dueResult.enqueuedJobs.filter((job) => job.payload["scheduleId"] === schedule.id),
          timestamp
        )
      )
    );
  }

  return dueResult;
}

export async function runWorkerCycle(): Promise<WorkerCycleResult> {
  const firstPendingJob = queue.listJobs("pending")[0] ?? null;

  if (!firstPendingJob) {
    return {
      handled: false,
      jobId: null,
      status: "idle"
    };
  }

  const worker = createBullMqJobWorker(jobsStateFilePath, {
    concurrency: 1,
    processor: async (job) => {
      const handler = jobHandlers[job.type];

      if (!handler) {
        throw new Error(`no handler registered for ${job.type}`);
      }
      try {
        const result = await handler(job);
        appendWorkerAudit({
          jobId: job.id,
          createdBy: job.createdBy,
          action: "job.executed",
          type: job.type,
          status: "success",
          retryCount: job.retryCount
        });
        return result;
      } catch (error) {
        appendWorkerAudit({
          jobId: job.id,
          createdBy: job.createdBy,
          action: "job.execution-failed",
          type: job.type,
          status: "failed",
          retryCount: job.retryCount
        });
        throw error;
      }
    }
  });

  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = queue.getJob(firstPendingJob.id);

      if (current?.status === "success") {
        return {
          handled: true,
          jobId: current.id,
          status: "success"
        };
      }

      if (current?.status === "failed") {
        return {
          handled: true,
          jobId: current.id,
          status: "failed"
        };
      }

      if (current?.status === "pending" && current.retryCount > 0) {
        return {
          handled: true,
          jobId: current.id,
          status: "retrying"
        };
      }

      await delay(250);
    }

    return {
      handled: true,
      jobId: firstPendingJob.id,
      status: "idle"
    };
  } finally {
    await worker.close();
  }
}

export async function startWorkerLoop(
  pollIntervalMs = Number(process.env["INFRALYNX_JOB_POLL_INTERVAL_MS"] ?? "1000")
) {
  console.log(describeWorkerRuntime());

  if (process.env["INFRALYNX_WORKER_MODE"] === "once") {
    runSchedulerCycle();
    const result = await runWorkerCycle();
    console.log(`worker cycle result: ${result.status}`);
    return result;
  }

  const worker = createBullMqJobWorker(jobsStateFilePath, {
    concurrency: Number(process.env["INFRALYNX_JOB_CONCURRENCY"] ?? "2"),
    processor: async (job) => {
      const handler = jobHandlers[job.type];

      if (!handler) {
        throw new Error(`no handler registered for ${job.type}`);
      }
      try {
        const result = await handler(job);
        appendWorkerAudit({
          jobId: job.id,
          createdBy: job.createdBy,
          action: "job.executed",
          type: job.type,
          status: "success",
          retryCount: job.retryCount
        });
        return result;
      } catch (error) {
        appendWorkerAudit({
          jobId: job.id,
          createdBy: job.createdBy,
          action: "job.execution-failed",
          type: job.type,
          status: "failed",
          retryCount: job.retryCount
        });
        throw error;
      }
    }
  });
  const schedulerRuntime = startSchedulerRuntime(schedulerStore, queue);
  void pollIntervalMs;

  const stop = async () => {
    schedulerRuntime.stop();
    await worker.close();
  };

  process.once("SIGINT", () => {
    void stop().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void stop().finally(() => process.exit(0));
  });

  return {
    handled: false,
    jobId: null,
    status: "idle" as const
  };
}
