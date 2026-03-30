import { requestJson } from "./api-client";

export type WorkflowStatus = "pending" | "approved" | "rejected";
export type WorkflowType = "job-execution" | "change-control" | "access-review";

export interface WorkflowApprovalRequest {
  readonly id: string;
  readonly type: WorkflowType;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly status: WorkflowStatus;
  readonly requestedBy: string;
  readonly tenantId: string;
  readonly assignedTo: {
    readonly userIds: readonly string[];
    readonly roleIds: readonly string[];
  };
  readonly scope: {
    readonly tenantId: string | null;
    readonly siteId: string | null;
    readonly deviceId: string | null;
  };
  readonly execution: {
    readonly jobType: string;
    readonly payload: Record<string, unknown>;
    readonly triggeredJobId: string | null;
  } | null;
  readonly decisionComment: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkflowSummaryResponse {
  readonly requests: readonly WorkflowApprovalRequest[];
  readonly summary: {
    readonly total: number;
    readonly pending: number;
    readonly approved: number;
    readonly rejected: number;
  };
}

export async function fetchWorkflows() {
  return requestJson<WorkflowSummaryResponse>("/api/workflows");
}

export async function createWorkflowRequest(input: {
  readonly type: WorkflowType;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly assignedUserIds: readonly string[];
  readonly assignedRoleIds: readonly string[];
  readonly tenantId?: string | null;
  readonly siteId?: string | null;
  readonly deviceId?: string | null;
  readonly jobType?: string | null;
  readonly jobPayload?: Record<string, unknown> | null;
}) {
  return requestJson<{ readonly request: WorkflowApprovalRequest }>("/api/workflows", {
    method: "POST",
    body: input
  });
}

export async function approveWorkflowRequest(requestId: string, comment?: string) {
  return requestJson<{ readonly request: WorkflowApprovalRequest }>(`/api/workflows/${requestId}/approve`, {
    method: "POST",
    body: { comment: comment ?? "" }
  });
}

export async function rejectWorkflowRequest(requestId: string, comment?: string) {
  return requestJson<{ readonly request: WorkflowApprovalRequest }>(`/api/workflows/${requestId}/reject`, {
    method: "POST",
    body: { comment: comment ?? "" }
  });
}
