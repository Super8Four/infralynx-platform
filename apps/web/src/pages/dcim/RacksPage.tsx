import { CrudResourcePage } from "../shared/CrudResourcePage";

interface RackListRecord {
  readonly id: string;
  readonly name: string;
  readonly siteId: string;
  readonly siteName?: string;
  readonly totalUnits: number;
  readonly deviceCount?: number;
}

export function RacksPage({
  mode,
  recordId
}: {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}) {
  return (
    <CrudResourcePage<RackListRecord, RackListRecord>
      resource="racks"
      routeBase="racks"
      title="Racks"
      singularLabel="Rack"
      mode={mode}
      recordId={recordId}
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "siteName", label: "Site", sortable: true, render: (record) => record.siteName ?? record.siteId },
        { id: "totalUnits", label: "Units", sortable: true, render: (record) => String(record.totalUnits) },
        { id: "deviceCount", label: "Devices", sortable: true, render: (record) => String(record.deviceCount ?? 0) }
      ]}
      fields={[
        { id: "id", label: "ID" },
        { id: "name", label: "Name", required: true },
        { id: "siteId", label: "Site ID", required: true },
        { id: "totalUnits", label: "Total Units", type: "number", required: true }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.name },
        { label: "Site", value: record.siteName ?? record.siteId },
        { label: "Total Units", value: String(record.totalUnits) }
      ]}
      toFormValues={(record) => ({
        id: record?.id ?? "",
        name: record?.name ?? "",
        siteId: record?.siteId ?? "",
        totalUnits: record ? String(record.totalUnits) : "42"
      })}
      toPayload={(values) => ({
        ...values,
        totalUnits: Number(values["totalUnits"] ?? "0")
      })}
      renderRelated={({ related }) => (
        <section className="related-panel">
          <h4>Devices In Rack</h4>
          <ul>{((related["devices"] as readonly { name: string }[] | undefined) ?? []).map((device) => <li key={device.name}>{device.name}</li>)}</ul>
        </section>
      )}
    />
  );
}
