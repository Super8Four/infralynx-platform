import { ReadOnlyResourcePage } from "../shared/ReadOnlyResourcePage";

interface VrfRecord {
  readonly id: string;
  readonly name: string;
  readonly rd: string | null;
  readonly tenantId: string | null;
}

export function VrfsPage() {
  return (
    <ReadOnlyResourcePage<VrfRecord>
      resource="vrfs"
      title="VRFs"
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "rd", label: "RD", sortable: true, render: (record) => record.rd ?? "Unassigned" },
        { id: "tenantId", label: "Tenant", sortable: true, render: (record) => record.tenantId ?? "Shared" }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.name },
        { label: "RD", value: record.rd ?? "Unassigned" },
        { label: "Tenant", value: record.tenantId ?? "Shared" }
      ]}
    />
  );
}
