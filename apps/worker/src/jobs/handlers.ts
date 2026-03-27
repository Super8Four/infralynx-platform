import type { JobRecord } from "../../../../packages/job-core/dist/index.js";
import { executeImportJobPayload } from "../../../../packages/data-transfer/dist/index.js";

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

export const jobHandlers: Readonly<Record<string, JobHandler>> = {
  "core.echo": async (job) => ({
    echoedPayload: job.payload,
    processedAt: new Date().toISOString()
  }),
  "core.retry-demo": async (job) => {
    const failUntilAttempt =
      typeof job.payload["failUntilAttempt"] === "number"
        ? Number(job.payload["failUntilAttempt"])
        : 0;
    const currentAttempt = job.retryCount + 1;

    if (currentAttempt <= failUntilAttempt) {
      throw new Error(`simulated retry path on attempt ${currentAttempt}`);
    }

    return {
      recoveredAtAttempt: currentAttempt
    };
  },
  "data-transfer.import": async (job) => executeImportJobPayload(job.payload)
  
};
