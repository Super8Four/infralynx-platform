import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalRequestType = "job-execution" | "change-control" | "access-review";

export interface ApprovalAssignee {
  readonly userIds: readonly string[];
  readonly roleIds: readonly string[];
}

export interface ApprovalExecutionBinding {
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly triggeredJobId: string | null;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly type: ApprovalRequestType;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly status: ApprovalStatus;
  readonly requestedBy: string;
  readonly tenantId: string;
  readonly assignedTo: ApprovalAssignee;
  readonly scope: {
    readonly tenantId: string | null;
    readonly siteId: string | null;
    readonly deviceId: string | null;
  };
  readonly execution: ApprovalExecutionBinding | null;
  readonly decisionComment: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface WorkflowState {
  readonly requests: readonly ApprovalRequest[];
}

const EMPTY_STATE: WorkflowState = {
  requests: []
};

export interface CreateApprovalRequestInput {
  readonly type: ApprovalRequestType;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly requestedBy: string;
  readonly tenantId: string;
  readonly assignedTo?: Partial<ApprovalAssignee>;
  readonly scope?: {
    readonly tenantId?: string | null;
    readonly siteId?: string | null;
    readonly deviceId?: string | null;
  };
  readonly execution?: {
    readonly jobType: string;
    readonly payload: Record<string, unknown>;
  } | null;
}

export function createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
  const timestamp = new Date().toISOString();

  return {
    id: `approval-${randomUUID()}`,
    type: input.type,
    title: input.title.trim(),
    payload: input.payload,
    status: "pending",
    requestedBy: input.requestedBy,
    tenantId: input.tenantId,
    assignedTo: {
      userIds: input.assignedTo?.userIds ?? [],
      roleIds: input.assignedTo?.roleIds ?? []
    },
    scope: {
      tenantId: input.scope?.tenantId ?? input.tenantId,
      siteId: input.scope?.siteId ?? null,
      deviceId: input.scope?.deviceId ?? null
    },
    execution: input.execution
      ? {
          jobType: input.execution.jobType,
          payload: input.execution.payload,
          triggeredJobId: null
        }
      : null,
    decisionComment: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function canReviewApproval(
  request: ApprovalRequest,
  reviewer: {
    readonly userId: string;
    readonly roleIds: readonly string[];
    readonly tenantId: string;
  }
) {
  if (request.status !== "pending") {
    return {
      allowed: false,
      reason: "approval request is no longer pending"
    };
  }

  if (request.tenantId !== reviewer.tenantId && reviewer.tenantId !== "platform") {
    return {
      allowed: false,
      reason: "approval request belongs to a different tenant"
    };
  }

  if (request.assignedTo.userIds.includes(reviewer.userId)) {
    return {
      allowed: true,
      reason: "reviewer is directly assigned"
    };
  }

  if (request.assignedTo.roleIds.some((roleId) => reviewer.roleIds.includes(roleId))) {
    return {
      allowed: true,
      reason: "reviewer matches an assigned role"
    };
  }

  return {
    allowed: false,
    reason: "reviewer does not match the assigned users or roles"
  };
}

export function approveRequest(
  request: ApprovalRequest,
  reviewerId: string,
  triggeredJobId: string | null,
  comment: string | null = null
): ApprovalRequest {
  const timestamp = new Date().toISOString();

  return {
    ...request,
    status: "approved",
    decisionComment: comment,
    decidedBy: reviewerId,
    decidedAt: timestamp,
    updatedAt: timestamp,
    execution: request.execution
      ? {
          ...request.execution,
          triggeredJobId
        }
      : null
  };
}

export function rejectRequest(
  request: ApprovalRequest,
  reviewerId: string,
  comment: string | null = null
): ApprovalRequest {
  const timestamp = new Date().toISOString();

  return {
    ...request,
    status: "rejected",
    decisionComment: comment,
    decidedBy: reviewerId,
    decidedAt: timestamp,
    updatedAt: timestamp
  };
}

export class FileBackedWorkflowRepository {
  readonly #stateFilePath: string;
  #loadedState: WorkflowState | null = null;

  constructor(stateFilePath: string) {
    this.#stateFilePath = stateFilePath;
  }

  listRequests(filters?: {
    readonly status?: ApprovalStatus;
    readonly tenantId?: string;
    readonly requestedBy?: string;
  }): readonly ApprovalRequest[] {
    return this.#loadState().requests.filter((request) => {
      if (filters?.status && request.status !== filters.status) {
        return false;
      }

      if (filters?.tenantId && request.tenantId !== filters.tenantId) {
        return false;
      }

      if (filters?.requestedBy && request.requestedBy !== filters.requestedBy) {
        return false;
      }

      return true;
    });
  }

  getRequestById(requestId: string): ApprovalRequest | null {
    return this.#loadState().requests.find((request) => request.id === requestId) ?? null;
  }

  saveRequest(request: ApprovalRequest): ApprovalRequest {
    const state = this.#loadState();
    const requests = state.requests
      .filter((entry) => entry.id !== request.id)
      .concat(request)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    this.#persistState({
      requests
    });

    return request;
  }

  #loadState(): WorkflowState {
    if (this.#loadedState) {
      return this.#loadedState;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as Partial<WorkflowState>;
      this.#loadedState = {
        requests: parsed.requests ?? []
      };
    } catch {
      this.#loadedState = EMPTY_STATE;
      this.#persistState(this.#loadedState);
    }

    return this.#loadedState;
  }

  #persistState(state: WorkflowState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
    this.#loadedState = state;
  }
}

export function createFileBackedWorkflowRepository(stateFilePath: string) {
  return new FileBackedWorkflowRepository(stateFilePath);
}

export function validateApprovalRequestInput(input: {
  readonly title?: string;
  readonly payload?: unknown;
  readonly assignedTo?: Partial<ApprovalAssignee>;
  readonly execution?: { readonly jobType?: string; readonly payload?: unknown } | null;
}) {
  const errors: string[] = [];

  if (typeof input.title !== "string" || input.title.trim().length < 3) {
    errors.push("title must be at least 3 characters");
  }

  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    errors.push("payload must be a JSON object");
  }

  const assignedUserIds = input.assignedTo?.userIds ?? [];
  const assignedRoleIds = input.assignedTo?.roleIds ?? [];

  if (assignedUserIds.length === 0 && assignedRoleIds.length === 0) {
    errors.push("at least one assigned user or role is required");
  }

  if (input.execution) {
    if (typeof input.execution.jobType !== "string" || input.execution.jobType.trim().length === 0) {
      errors.push("execution.jobType is required when execution is configured");
    }

    if (
      !input.execution.payload ||
      typeof input.execution.payload !== "object" ||
      Array.isArray(input.execution.payload)
    ) {
      errors.push("execution.payload must be a JSON object");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function workflowSummary(requests: readonly ApprovalRequest[]) {
  return {
    total: requests.length,
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
    rejected: requests.filter((request) => request.status === "rejected").length
  };
}
