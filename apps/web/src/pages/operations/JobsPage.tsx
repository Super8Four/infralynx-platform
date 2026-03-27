import { useEffect, useState } from "react";

import { DetailSection } from "../../components/detail/DetailSection";
import { DataTable } from "../../components/tables/DataTable";
import { fetchJobs, type JobRecord } from "../../services/jobs";

export function JobsPage() {
  const [jobs, setJobs] = useState<readonly JobRecord[]>([]);
  const [selected, setSelected] = useState<JobRecord | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetchJobs(status).then((response) => {
      setJobs(response.jobs);
      setSelected((current) => current ?? response.jobs[0] ?? null);
    });
  }, [status]);

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">Jobs</p>
          <h2>Jobs</h2>
        </div>
        <p className="workspace-page__summary">
          Read-only view of the background task system already running behind the platform.
        </p>
      </header>
      <div className="page-shell">
        <div className="page-shell__toolbar">
          <div className="page-shell__filters">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <DataTable
          columns={[
            { id: "type", label: "Type", sortable: true, render: (record: JobRecord) => record.type },
            { id: "status", label: "Status", sortable: true, render: (record: JobRecord) => record.status },
            { id: "createdBy", label: "Created By", sortable: true, render: (record: JobRecord) => record.createdBy },
            { id: "retryCount", label: "Retries", sortable: true, render: (record: JobRecord) => String(record.retryCount) }
          ]}
          records={jobs}
          sortField="createdAt"
          sortDirection="desc"
          onSort={() => undefined}
          getRowKey={(record) => record.id}
          onRowSelect={(record) => setSelected(record)}
          emptyState="No jobs matched the current status filter."
        />
        {selected ? (
          <DetailSection
            title={selected.type}
            fields={[
              { label: "ID", value: selected.id },
              { label: "Status", value: selected.status },
              { label: "Created By", value: selected.createdBy },
              { label: "Created", value: selected.createdAt },
              { label: "Updated", value: selected.updatedAt }
            ]}
          >
            <section className="related-panel">
              <h4>Logs</h4>
              <ul>{selected.logs.map((log) => <li key={`${log.timestamp}-${log.message}`}>{`${log.timestamp} · ${log.level} · ${log.message}`}</li>)}</ul>
            </section>
          </DetailSection>
        ) : null}
      </div>
    </section>
  );
}
