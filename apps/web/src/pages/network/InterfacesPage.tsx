import { ReadOnlyResourcePage } from "../shared/ReadOnlyResourcePage";

interface InterfaceRecord {
  readonly id: string;
  readonly deviceId: string;
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
}

export function InterfacesPage() {
  return (
    <ReadOnlyResourcePage<InterfaceRecord>
      resource="interfaces"
      title="Interfaces"
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "deviceId", label: "Device", sortable: true, render: (record) => record.deviceId },
        { id: "kind", label: "Kind", sortable: true, render: (record) => record.kind },
        { id: "enabled", label: "Enabled", sortable: true, render: (record) => (record.enabled ? "Yes" : "No") }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Device", value: record.deviceId },
        { label: "Name", value: record.name },
        { label: "Kind", value: record.kind },
        { label: "Enabled", value: record.enabled ? "Yes" : "No" }
      ]}
    />
  );
}
