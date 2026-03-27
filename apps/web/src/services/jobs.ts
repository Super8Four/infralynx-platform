import { requestJson } from "./api-client";

export interface JobRecord {
  readonly id: string;
  readonly type: string;
  readonly status: "pending" | "running" | "success" | "failed";
  readonly payload: Record<string, unknown>;
  readonly result: Record<string, unknown> | null;
  readonly retryCount: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly logs: readonly {
    readonly jobId: string;
    readonly level: string;
    readonly message: string;
    readonly timestamp: string;
  }[];
}

export async function fetchJobs(status = "") {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson<{ readonly jobs: readonly JobRecord[] }>(`/api/jobs${suffix}`);
}
