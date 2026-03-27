import { CrudResourcePage } from "../shared/CrudResourcePage";

interface DeviceRecord {
  readonly id: string;
  readonly name: string;
  readonly siteId: string;
  readonly siteName?: string;
  readonly rackName?: string | null;
  readonly role: string;
  readonly status: string;
  readonly interfaceCount?: number;
  readonly ipAddressCount?: number;
  readonly rackPosition?: {
    readonly rackId: string;
    readonly face: string;
    readonly startingUnit: number;
    readonly heightUnits: number;
  } | null;
}

export function DevicesPage({
  mode,
  recordId
}: {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}) {
  return (
    <CrudResourcePage<DeviceRecord, DeviceRecord>
      resource="devices"
      routeBase="devices"
      title="Devices"
      singularLabel="Device"
      mode={mode}
      recordId={recordId}
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "role", label: "Role", sortable: true, render: (record) => record.role },
        { id: "siteName", label: "Site", sortable: true, render: (record) => record.siteName ?? record.siteId },
        { id: "status", label: "Status", sortable: true, render: (record) => record.status }
      ]}
      fields={[
        { id: "id", label: "ID" },
        { id: "name", label: "Name", required: true },
        { id: "siteId", label: "Site ID", required: true },
        {
          id: "role",
          label: "Role",
          type: "select",
          required: true,
          options: [
            { value: "server", label: "Server" },
            { value: "switch", label: "Switch" },
            { value: "router", label: "Router" },
            { value: "pdu", label: "PDU" },
            { value: "appliance", label: "Appliance" }
          ]
        },
        {
          id: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "active", label: "Active" },
            { value: "planned", label: "Planned" },
            { value: "offline", label: "Offline" },
            { value: "decommissioned", label: "Decommissioned" }
          ]
        },
        { id: "rackId", label: "Rack ID" },
        { id: "rackFace", label: "Rack Face" },
        { id: "startUnit", label: "Start Unit", type: "number" },
        { id: "heightUnits", label: "Height Units", type: "number" }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.name },
        { label: "Role", value: record.role },
        { label: "Status", value: record.status },
        { label: "Site", value: record.siteName ?? record.siteId },
        { label: "Rack", value: record.rackName ?? record.rackPosition?.rackId ?? "Unracked" }
      ]}
      toFormValues={(record) => ({
        id: record?.id ?? "",
        name: record?.name ?? "",
        siteId: record?.siteId ?? "",
        role: record?.role ?? "server",
        status: record?.status ?? "active",
        rackId: record?.rackPosition?.rackId ?? "",
        rackFace: record?.rackPosition?.face ?? "front",
        startUnit: record?.rackPosition ? String(record.rackPosition.startingUnit) : "",
        heightUnits: record?.rackPosition ? String(record.rackPosition.heightUnits) : ""
      })}
      toPayload={(values) => values}
      renderRelated={({ related }) => (
        <div className="related-grid">
          <section className="related-panel">
            <h4>Interfaces</h4>
            <ul>{((related["interfaces"] as readonly { name: string }[] | undefined) ?? []).map((entry) => <li key={entry.name}>{entry.name}</li>)}</ul>
          </section>
          <section className="related-panel">
            <h4>IP Addresses</h4>
            <ul>{((related["ipAddresses"] as readonly { address: string }[] | undefined) ?? []).map((entry) => <li key={entry.address}>{entry.address}</li>)}</ul>
          </section>
          <section className="related-panel">
            <h4>Connections</h4>
            <ul>{((related["connections"] as readonly { label: string }[] | undefined) ?? []).map((entry) => <li key={entry.label}>{entry.label}</li>)}</ul>
          </section>
        </div>
      )}
    />
  );
}
