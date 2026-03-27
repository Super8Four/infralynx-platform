import { ReadOnlyResourcePage } from "../shared/ReadOnlyResourcePage";

interface ConnectionRecord {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly fromDeviceId: string;
  readonly toDeviceId: string;
  readonly status: string;
}

export function ConnectionsPage() {
  return (
    <ReadOnlyResourcePage<ConnectionRecord>
      resource="connections"
      title="Connections"
      columns={[
        { id: "label", label: "Label", sortable: true, render: (record) => record.label },
        { id: "kind", label: "Kind", sortable: true, render: (record) => record.kind },
        { id: "fromDeviceId", label: "From", sortable: true, render: (record) => record.fromDeviceId },
        { id: "toDeviceId", label: "To", sortable: true, render: (record) => record.toDeviceId }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Label", value: record.label },
        { label: "Kind", value: record.kind },
        { label: "From Device", value: record.fromDeviceId },
        { label: "To Device", value: record.toDeviceId },
        { label: "Status", value: record.status }
      ]}
    />
  );
}
