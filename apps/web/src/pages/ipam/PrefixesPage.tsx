import { CrudResourcePage } from "../shared/CrudResourcePage";

interface PrefixRecord {
  readonly id: string;
  readonly cidr: string;
  readonly vrfId: string | null;
  readonly vrfName?: string;
  readonly parentPrefixId: string | null;
  readonly status: string;
  readonly allocationMode: string;
  readonly tenantId: string | null;
  readonly childCount?: number;
  readonly ipAddressCount?: number;
  readonly utilizationPercent?: number | null;
}

export function PrefixesPage({
  mode,
  recordId
}: {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}) {
  return (
    <CrudResourcePage<PrefixRecord, PrefixRecord>
      resource="prefixes"
      routeBase="prefixes"
      title="Prefixes"
      singularLabel="Prefix"
      mode={mode}
      recordId={recordId}
      columns={[
        { id: "cidr", label: "CIDR", sortable: true, render: (record) => record.cidr },
        { id: "vrfName", label: "VRF", sortable: true, render: (record) => record.vrfName ?? record.vrfId ?? "Global" },
        { id: "status", label: "Status", sortable: true, render: (record) => record.status },
        { id: "utilizationPercent", label: "Utilization", sortable: true, render: (record) => record.utilizationPercent === null || record.utilizationPercent === undefined ? "n/a" : `${record.utilizationPercent}%` }
      ]}
      fields={[
        { id: "id", label: "ID" },
        { id: "cidr", label: "CIDR", required: true },
        { id: "vrfId", label: "VRF ID" },
        { id: "parentPrefixId", label: "Parent Prefix ID" },
        { id: "tenantId", label: "Tenant ID" },
        {
          id: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "active", label: "Active" },
            { value: "reserved", label: "Reserved" },
            { value: "deprecated", label: "Deprecated" }
          ]
        },
        {
          id: "allocationMode",
          label: "Allocation Mode",
          type: "select",
          required: true,
          options: [
            { value: "hierarchical", label: "Hierarchical" },
            { value: "pool", label: "Pool" },
            { value: "static", label: "Static" }
          ]
        }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "CIDR", value: record.cidr },
        { label: "VRF", value: record.vrfName ?? record.vrfId ?? "Global" },
        { label: "Status", value: record.status },
        { label: "Allocation Mode", value: record.allocationMode },
        { label: "Tenant", value: record.tenantId ?? "Shared" }
      ]}
      toFormValues={(record) => ({
        id: record?.id ?? "",
        cidr: record?.cidr ?? "",
        vrfId: record?.vrfId ?? "",
        parentPrefixId: record?.parentPrefixId ?? "",
        tenantId: record?.tenantId ?? "",
        status: record?.status ?? "active",
        allocationMode: record?.allocationMode ?? "pool"
      })}
      toPayload={(values) => values}
      renderRelated={({ related }) => (
        <div className="related-grid">
          <section className="related-panel">
            <h4>Child Prefixes</h4>
            <ul>{((related["children"] as readonly { cidr: string }[] | undefined) ?? []).map((entry) => <li key={entry.cidr}>{entry.cidr}</li>)}</ul>
          </section>
          <section className="related-panel">
            <h4>IP Allocations</h4>
            <ul>{((related["ipAllocations"] as readonly { address: string }[] | undefined) ?? []).map((entry) => <li key={entry.address}>{entry.address}</li>)}</ul>
          </section>
        </div>
      )}
    />
  );
}
