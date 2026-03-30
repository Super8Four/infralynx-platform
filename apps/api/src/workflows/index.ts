import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createJobRecord } from "../../../../packages/job-core/dist/index.js";
import { createFileBackedJobQueueStore } from "../../../../packages/job-queue/dist/index.js";
import {
  approveRequest,
  canReviewApproval,
  createApprovalRequest,
  createFileBackedWorkflowRepository,
  rejectRequest,
  validateApprovalRequestInput,
  workflowSummary,
  type ApprovalRequestType
} from "../../../../packages/workflow-core/dist/index.js";
import { appendAuditRecord } from "../audit/index.js";
import {
  createInventoryContext,
  isWritableResource,
  validateInventoryMutationPayload,
  type WritableInventoryResource
} from "../inventory/index.js";
import { createRequestIdentity, requireApiPermission } from "../rbac/index.js";

const workflowRootDirectory = resolve(process.cwd(), "runtime-data/workflows");
const workflowStateFilePath = resolve(workflowRootDirectory, "state.json");
const jobsStateFilePath = resolve(process.cwd(), "runtime-data/jobs/queue-state.json");

mkdirSync(dirname(workflowStateFilePath), { recursive: true });

const workflowRepository = createFileBackedWorkflowRepository(workflowStateFilePath);
const jobQueue = createFileBackedJobQueueStore(jobsStateFilePath);

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

async function parseJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readRequestBody(request);

  if (!body.trim()) {
    return {};
  }

  const parsed = JSON.parse(body) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("request body must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function asRequestType(value: unknown): ApprovalRequestType | null {
  if (value === "job-execution" || value === "change-control" || value === "access-review") {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createWorkflowResponse(identityTenantId?: string) {
  const requests = workflowRepository.listRequests(
    identityTenantId && identityTenantId !== "platform"
      ? { tenantId: identityTenantId }
      : undefined
  );

  return {
    requests,
    summary: workflowSummary(requests)
  };
}

function canAccessWorkflowForTenant(workflowTenantId: string, identityTenantId: string) {
  return identityTenantId === "platform" || workflowTenantId === identityTenantId;
}

async function handleCreateWorkflow(request: IncomingMessage, response: ServerResponse) {
  const identity = await requireApiPermission(request, response, "workflow:write");

  if (!identity) {
    return;
  }

  try {
    const payload = await parseJsonBody(request);
    const validation = validateApprovalRequestInput({
      title: asString(payload["title"]) ?? undefined,
      payload: payload["payload"],
      assignedTo: {
        userIds: asStringArray(payload["assignedUserIds"]),
        roleIds: asStringArray(payload["assignedRoleIds"])
      },
      execution:
        payload["jobType"] && payload["jobPayload"]
          ? {
              jobType: String(payload["jobType"]),
              payload: payload["jobPayload"]
            }
          : null
    });

    if (!validation.valid) {
      sendJson(response, 400, {
        error: {
          code: "validation_failed",
          message: validation.errors.join("; ")
        }
      });
      return;
    }

    const requestType = asRequestType(payload["type"]);

    if (!requestType) {
      sendJson(response, 400, {
        error: {
          code: "invalid_type",
          message: "type must be job-execution, change-control, or access-review"
        }
      });
      return;
    }

    let workflowPayload = isRecord(payload["payload"]) ? { ...payload["payload"] } : {};
    const validationRequest = isRecord(workflowPayload["validationRequest"])
      ? workflowPayload["validationRequest"]
      : null;

    if (requestType === "change-control" && validationRequest) {
      const validationResource =
        typeof validationRequest["resource"] === "string" ? validationRequest["resource"] : null;
      const validationOperation =
        validationRequest["operation"] === "create" || validationRequest["operation"] === "update"
          ? validationRequest["operation"]
          : null;
      const validationRecord = isRecord(validationRequest["record"]) ? validationRequest["record"] : null;
      const validationExistingId = asString(validationRequest["existingId"]);

      if (!validationResource || !isWritableResource(validationResource) || !validationOperation || !validationRecord) {
        sendJson(response, 400, {
          error: {
            code: "invalid_validation_request",
            message:
              "change-control requests must provide validationRequest.resource, validationRequest.operation, and validationRequest.record"
          }
        });
        return;
      }

      const writableValidationResource: WritableInventoryResource = validationResource;

      const validationOutcome = validateInventoryMutationPayload(
        createInventoryContext(),
        writableValidationResource,
        validationRecord,
        {
          operation: validationOperation,
          existingId: validationOperation === "update" ? validationExistingId ?? undefined : undefined
        }
      );

      if (!validationOutcome.validation.valid) {
        sendJson(response, validationOutcome.validation.conflicts.length > 0 ? 409 : 400, {
          error: {
            code: validationOutcome.validation.conflicts.length > 0 ? "conflict_detected" : "validation_failed",
            message:
              validationOutcome.validation.conflicts.length > 0
                ? "change-control request failed validation"
                : "change-control request is invalid",
            fields: validationOutcome.validation.errors,
            conflicts: validationOutcome.validation.conflicts,
            warnings: validationOutcome.validation.warnings
          }
        });
        return;
      }

      workflowPayload = {
        ...workflowPayload,
        validationSummary: {
          resource: writableValidationResource,
          operation: validationOperation,
          valid: true,
          warnings: validationOutcome.validation.warnings,
          candidateRecordId: validationOutcome.validation.record?.id ?? null
        }
      };
    }

    const record = workflowRepository.saveRequest(
      createApprovalRequest({
        type: requestType,
        title: asString(payload["title"]) as string,
        payload: workflowPayload,
        requestedBy: identity.id,
        tenantId: identity.tenantId,
        assignedTo: {
          userIds: asStringArray(payload["assignedUserIds"]),
          roleIds: asStringArray(payload["assignedRoleIds"])
        },
        scope: {
          tenantId: asString(payload["tenantId"]) ?? identity.tenantId,
          siteId: asString(payload["siteId"]),
          deviceId: asString(payload["deviceId"])
        },
        execution:
          payload["jobType"] && payload["jobPayload"]
            ? {
                jobType: String(payload["jobType"]),
                payload: payload["jobPayload"] as Record<string, unknown>
              }
            : null
      })
    );

    appendAuditRecord({
      userId: identity.id,
      actorType: "user",
      tenantId: identity.tenantId,
      action: "workflow.request.created",
      objectType: "workflow",
      objectId: record.id,
      metadata: {
        type: record.type,
        assignedRoleIds: record.assignedTo.roleIds,
        assignedUserIds: record.assignedTo.userIds
      }
    });

    sendJson(response, 201, {
      request: record,
      summary: createWorkflowResponse(identity.tenantId).summary
    });
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
  }
}

async function handleApproveWorkflow(
  request: IncomingMessage,
  response: ServerResponse,
  workflowId: string
) {
  const identity = await requireApiPermission(request, response, "workflow:approve");

  if (!identity) {
    return;
  }

  const record = workflowRepository.getRequestById(workflowId);

  if (!record) {
    sendJson(response, 404, {
      error: {
        code: "not_found",
        message: "approval request was not found"
      }
    });
    return;
  }

  if (!canAccessWorkflowForTenant(record.tenantId, identity.tenantId)) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: "approval request belongs to a different tenant"
      }
    });
    return;
  }

  const reviewDecision = canReviewApproval(record, {
    userId: identity.id,
    roleIds: identity.roleIds,
    tenantId: identity.tenantId
  });

  if (!reviewDecision.allowed) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: reviewDecision.reason
      }
    });
    return;
  }

  const payload = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const comment = asString(payload["comment"]);
  let triggeredJobId: string | null = null;

  if (record.execution) {
    const job = createJobRecord({
      type: record.execution.jobType,
      payload: {
        ...record.execution.payload,
        approvalRequestId: record.id
      },
      createdBy: identity.id
    });
    jobQueue.enqueue(job);
    triggeredJobId = job.id;
  }

  const approved = workflowRepository.saveRequest(
    approveRequest(record, identity.id, triggeredJobId, comment)
  );

  appendAuditRecord({
    userId: identity.id,
    actorType: "user",
    tenantId: identity.tenantId,
    action: "workflow.request.approved",
    objectType: "workflow",
    objectId: approved.id,
    metadata: {
      triggeredJobId
    }
  });

  sendJson(response, 200, {
    request: approved
  });
}

async function handleRejectWorkflow(
  request: IncomingMessage,
  response: ServerResponse,
  workflowId: string
) {
  const identity = await requireApiPermission(request, response, "workflow:approve");

  if (!identity) {
    return;
  }

  const record = workflowRepository.getRequestById(workflowId);

  if (!record) {
    sendJson(response, 404, {
      error: {
        code: "not_found",
        message: "approval request was not found"
      }
    });
    return;
  }

  if (!canAccessWorkflowForTenant(record.tenantId, identity.tenantId)) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: "approval request belongs to a different tenant"
      }
    });
    return;
  }

  const reviewDecision = canReviewApproval(record, {
    userId: identity.id,
    roleIds: identity.roleIds,
    tenantId: identity.tenantId
  });

  if (!reviewDecision.allowed) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: reviewDecision.reason
      }
    });
    return;
  }

  const payload = await parseJsonBody(request).catch(() => ({} as Record<string, unknown>));
  const rejected = workflowRepository.saveRequest(
    rejectRequest(record, identity.id, asString(payload["comment"]))
  );

  appendAuditRecord({
    userId: identity.id,
    actorType: "user",
    tenantId: identity.tenantId,
    action: "workflow.request.rejected",
    objectType: "workflow",
    objectId: rejected.id,
    metadata: {}
  });

  sendJson(response, 200, {
    request: rejected
  });
}

export async function handleWorkflowsApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/workflows")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/workflows") {
    const identity = await requireApiPermission(request, response, "workflow:read");

    if (!identity) {
      return true;
    }

    sendJson(response, 200, createWorkflowResponse(identity.tenantId));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/workflows") {
    await handleCreateWorkflow(request, response);
    return true;
  }

  const approveMatch = requestUrl.pathname.match(/^\/api\/workflows\/([^/]+)\/approve$/);

  if (request.method === "POST" && approveMatch) {
    await handleApproveWorkflow(request, response, approveMatch[1]);
    return true;
  }

  const rejectMatch = requestUrl.pathname.match(/^\/api\/workflows\/([^/]+)\/reject$/);

  if (request.method === "POST" && rejectMatch) {
    await handleRejectWorkflow(request, response, rejectMatch[1]);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/workflows/summary/current-reviewer") {
    const identity = await createRequestIdentity(request);

    if (!identity) {
      sendJson(response, 401, {
        error: {
          code: "unauthorized",
          message: "authentication is required"
        }
      });
      return true;
    }

    const requests = workflowRepository.listRequests(
      identity.tenantId !== "platform" ? { tenantId: identity.tenantId } : undefined
    );

    sendJson(response, 200, {
      reviewerId: identity.id,
      reviewableCount: requests.filter((request) =>
        canReviewApproval(request, {
          userId: identity.id,
          roleIds: identity.roleIds,
          tenantId: identity.tenantId
        }).allowed
      ).length
    });
    return true;
  }

  const workflowMatch = requestUrl.pathname.match(/^\/api\/workflows\/([^/]+)$/);

  if (request.method === "GET" && workflowMatch) {
    const identity = await requireApiPermission(request, response, "workflow:read");

    if (!identity) {
      return true;
    }

    const record = workflowRepository.getRequestById(workflowMatch[1]);

    if (!record) {
      sendJson(response, 404, {
        error: {
          code: "not_found",
          message: "approval request was not found"
        }
      });
      return true;
    }

    if (!canAccessWorkflowForTenant(record.tenantId, identity.tenantId)) {
      sendJson(response, 403, {
        error: {
          code: "forbidden",
          message: "approval request belongs to a different tenant"
        }
      });
      return true;
    }

    sendJson(response, 200, { request: record });
    return true;
  }

  return false;
}
