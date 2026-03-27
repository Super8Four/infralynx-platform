import { resolve } from "node:path";

import { workspaceMetadata } from "../../../../packages/config/dist/index.js";
import {
  createJobAuditSummary,
  createJobLog,
  markJobSucceeded,
  registerJobFailure,
  type JobLogRecord
} from "../../../../packages/job-core/dist/index.js";
import {
  appendFailureLogs,
  createFileBackedJobQueueStore
} from "../../../../packages/job-queue/dist/index.js";
import { platformBoundaries } from "../../../../packages/domain-core/dist/index.js";
import { jobHandlers } from "./handlers.js";

const jobsStateFilePath = resolve(process.cwd(), "runtime-data/jobs/queue-state.json");

export interface WorkerCycleResult {
  readonly handled: boolean;
  readonly jobId: string | null;
  readonly status: "idle" | "success" | "retrying" | "failed";
}

const queue = createFileBackedJobQueueStore(jobsStateFilePath);

export function describeWorkerRuntime(): string {
  return `${workspaceMetadata.name} worker boundary: ${platformBoundaries.worker}`;
}

export async function runWorkerCycle(): Promise<WorkerCycleResult> {
  const leasedJob = queue.leaseNextPendingJob();

  if (!leasedJob) {
    return {
      handled: false,
      jobId: null,
      status: "idle"
    };
  }

  const handler = jobHandlers[leasedJob.type];
  const initialLogs: JobLogRecord[] = [
    createJobLog(leasedJob.id, "info", `worker started ${leasedJob.type}`),
    createJobLog(leasedJob.id, "debug", createJobAuditSummary(leasedJob, "job.started"))
  ];

  queue.appendLogs(initialLogs);

  if (!handler) {
    const failure = registerJobFailure(leasedJob, `no handler registered for ${leasedJob.type}`);
    queue.saveJob(failure.job);
    queue.appendLogs([
      ...appendFailureLogs(failure),
      createJobLog(
        failure.job.id,
        "debug",
        createJobAuditSummary(failure.job, "job.failed"),
        failure.job.updatedAt
      )
    ]);

    return {
      handled: true,
      jobId: failure.job.id,
      status: failure.willRetry ? "retrying" : "failed"
    };
  }

  try {
    const result = await handler(leasedJob);
    const completedJob = markJobSucceeded(leasedJob, result);

    queue.saveJob(completedJob);
    queue.appendLogs([
      createJobLog(completedJob.id, "info", `worker completed ${completedJob.type}`, completedJob.updatedAt),
      createJobLog(
        completedJob.id,
        "debug",
        createJobAuditSummary(completedJob, "job.succeeded"),
        completedJob.updatedAt
      )
    ]);

    return {
      handled: true,
      jobId: completedJob.id,
      status: "success"
    };
  } catch (error) {
    const failure = registerJobFailure(
      leasedJob,
      error instanceof Error ? error.message : "unknown worker error"
    );

    queue.saveJob(failure.job);
    queue.appendLogs([
      ...appendFailureLogs(failure, failure.job.updatedAt),
      createJobLog(
        failure.job.id,
        "debug",
        createJobAuditSummary(failure.job, "job.failed"),
        failure.job.updatedAt
      )
    ]);

    return {
      handled: true,
      jobId: failure.job.id,
      status: failure.willRetry ? "retrying" : "failed"
    };
  }
}

export async function startWorkerLoop(
  pollIntervalMs = Number(process.env["INFRALYNX_JOB_POLL_INTERVAL_MS"] ?? "1000")
) {
  console.log(describeWorkerRuntime());

  if (process.env["INFRALYNX_WORKER_MODE"] === "once") {
    const result = await runWorkerCycle();
    console.log(`worker cycle result: ${result.status}`);

    return result;
  }

  setInterval(() => {
    void runWorkerCycle();
  }, pollIntervalMs);

  return {
    handled: false,
    jobId: null,
    status: "idle" as const
  };
}
