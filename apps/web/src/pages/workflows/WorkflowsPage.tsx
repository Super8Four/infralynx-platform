import { useEffect, useMemo, useState } from "react";

import { DetailSection } from "../../components/detail/DetailSection";
import { DataTable, type DataColumn } from "../../components/tables/DataTable";
import {
  approveWorkflowRequest,
  createWorkflowRequest,
  fetchWorkflows,
  rejectWorkflowRequest,
  type WorkflowApprovalRequest,
  type WorkflowSummaryResponse,
  type WorkflowType
} from "../../services/workflows";

interface WorkflowsPageProps {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}

const workflowColumns: readonly DataColumn<WorkflowApprovalRequest>[] = [
  { id: "title", label: "Title", sortable: true, render: (request) => request.title },
  { id: "type", label: "Type", sortable: true, render: (request) => request.type },
  { id: "status", label: "Status", sortable: true, render: (request) => request.status },
  { id: "requestedBy", label: "Requested By", sortable: true, render: (request) => request.requestedBy },
  { id: "createdAt", label: "Created", sortable: true, render: (request) => new Date(request.createdAt).toLocaleString() }
] as const;

function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createEmptyForm() {
  return {
    type: "job-execution" as WorkflowType,
    title: "",
    payloadJson: '{\n  "reason": "apply controlled change"\n}',
    assignedUserIds: "",
    assignedRoleIds: "core-platform-admin",
    tenantId: "tenant-ops",
    siteId: "",
    deviceId: "",
    jobType: "core.echo",
    jobPayloadJson: '{\n  "message": "approved workflow execution"\n}'
  };
}

export function WorkflowsPage({ mode, recordId }: WorkflowsPageProps) {
  const [summary, setSummary] = useState<WorkflowSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(createEmptyForm());

  async function refresh() {
    try {
      setSummary(await fetchWorkflows());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load approval workflows.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => summary?.requests.find((request) => request.id === recordId) ?? null,
    [recordId, summary]
  );

  async function handleCreate() {
    setSaving(true);
    setError(null);

    try {
      await createWorkflowRequest({
        type: form.type,
        title: form.title,
        payload: JSON.parse(form.payloadJson) as Record<string, unknown>,
        assignedUserIds: parseCommaSeparated(form.assignedUserIds),
        assignedRoleIds: parseCommaSeparated(form.assignedRoleIds),
        tenantId: form.tenantId || null,
        siteId: form.siteId || null,
        deviceId: form.deviceId || null,
        jobType: form.type === "job-execution" ? form.jobType : null,
        jobPayload:
          form.type === "job-execution"
            ? (JSON.parse(form.jobPayloadJson) as Record<string, unknown>)
            : null
      });
      setForm(createEmptyForm());
      await refresh();
      window.location.hash = "#/workflows";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create approval workflow.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(requestId: string) {
    const comment = window.prompt("Approval comment", "Approved through workflow console.");
    await approveWorkflowRequest(requestId, comment ?? undefined);
    await refresh();
  }

  async function handleReject(requestId: string) {
    const comment = window.prompt("Rejection comment", "Rejected through workflow console.");
    await rejectWorkflowRequest(requestId, comment ?? undefined);
    await refresh();
  }

  if (mode === "new") {
    return (
      <section className="workspace-page">
        <header className="workspace-page__header">
          <div>
            <p className="page-section__eyebrow">Operations</p>
            <h2>Create Approval Request</h2>
          </div>
          <p className="workspace-page__summary">Route high-impact changes through an explicit approval record before execution.</p>
        </header>
        {error ? <div className="page-shell__error">{error}</div> : null}
        <section className="page-shell__card">
          <div className="crud-form-grid">
            <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as WorkflowType }))}>
              <option value="job-execution">Job Execution</option>
              <option value="change-control">Change Control</option>
              <option value="access-review">Access Review</option>
            </select>
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Approval title" />
            <input value={form.assignedRoleIds} onChange={(event) => setForm((current) => ({ ...current, assignedRoleIds: event.target.value }))} placeholder="Assigned roles (comma separated)" />
            <input value={form.assignedUserIds} onChange={(event) => setForm((current) => ({ ...current, assignedUserIds: event.target.value }))} placeholder="Assigned users (comma separated)" />
            <input value={form.tenantId} onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))} placeholder="Tenant ID" />
            <input value={form.siteId} onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value }))} placeholder="Site ID (optional)" />
            <input value={form.deviceId} onChange={(event) => setForm((current) => ({ ...current, deviceId: event.target.value }))} placeholder="Device ID (optional)" />
            {form.type === "job-execution" ? (
              <>
                <input value={form.jobType} onChange={(event) => setForm((current) => ({ ...current, jobType: event.target.value }))} placeholder="Job type" />
                <textarea value={form.jobPayloadJson} onChange={(event) => setForm((current) => ({ ...current, jobPayloadJson: event.target.value }))} rows={6} />
              </>
            ) : null}
            <textarea value={form.payloadJson} onChange={(event) => setForm((current) => ({ ...current, payloadJson: event.target.value }))} rows={8} />
            <button type="button" onClick={handleCreate} disabled={saving}>Create Approval Request</button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">Operations</p>
          <h2>Approval Workflows</h2>
        </div>
        <p className="workspace-page__summary">Pending approvals gate execution and keep ownership explicit across job-driven changes.</p>
      </header>
      {error ? <div className="page-shell__error">{error}</div> : null}

      <div className="crud-layout-grid">
        <DetailSection
          title="Workflow Summary"
          fields={[
            { label: "Total", value: String(summary?.summary.total ?? 0) },
            { label: "Pending", value: String(summary?.summary.pending ?? 0) },
            { label: "Approved", value: String(summary?.summary.approved ?? 0) },
            { label: "Rejected", value: String(summary?.summary.rejected ?? 0) }
          ]}
        />
        <DetailSection
          title="Selected Request"
          fields={[
            { label: "Title", value: selected?.title ?? "Select a request from the table." },
            { label: "Status", value: selected?.status ?? "None selected" },
            { label: "Assignees", value: selected ? `${selected.assignedTo.roleIds.join(", ") || "No roles"} / ${selected.assignedTo.userIds.join(", ") || "No users"}` : "No assignee data" },
            { label: "Execution", value: selected?.execution ? `${selected.execution.jobType} -> ${selected.execution.triggeredJobId ?? "pending trigger"}` : "No execution binding" }
          ]}
        />
      </div>

      <section className="page-shell__card">
        <h3>Approval Queue</h3>
        <DataTable
          columns={workflowColumns}
          records={summary?.requests ?? []}
          sortField="createdAt"
          sortDirection="desc"
          onSort={() => undefined}
          getRowKey={(record) => record.id}
          onRowSelect={(record) => {
            window.location.hash = `#/workflows/${record.id}`;
          }}
          emptyState="No approval requests have been created yet."
        />
      </section>

      {selected ? (
        <section className="page-shell__card">
          <h3>Review Actions</h3>
          <div className="topbar-shell__actions">
            <button type="button" className="topbar-shell__action" onClick={() => void handleApprove(selected.id)} disabled={selected.status !== "pending"}>
              Approve
            </button>
            <button type="button" className="topbar-shell__action" onClick={() => void handleReject(selected.id)} disabled={selected.status !== "pending"}>
              Reject
            </button>
          </div>
          <pre className="page-shell__code-block">{JSON.stringify(selected.payload, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
}
