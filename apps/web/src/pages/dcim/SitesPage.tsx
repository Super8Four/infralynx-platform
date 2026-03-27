import { CrudResourcePage } from "../shared/CrudResourcePage";

interface SiteRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tenantId: string | null;
}

export function SitesPage({
  mode,
  recordId
}: {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}) {
  return (
    <CrudResourcePage<SiteRecord, SiteRecord>
      resource="sites"
      routeBase="sites"
      title="Sites"
      singularLabel="Site"
      mode={mode}
      recordId={recordId}
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "slug", label: "Slug", sortable: true, render: (record) => record.slug },
        { id: "tenantId", label: "Tenant", sortable: true, render: (record) => record.tenantId ?? "Shared" }
      ]}
      fields={[
        { id: "id", label: "ID" },
        { id: "name", label: "Name", required: true },
        { id: "slug", label: "Slug", required: true },
        { id: "tenantId", label: "Tenant ID" }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.name },
        { label: "Slug", value: record.slug },
        { label: "Tenant", value: record.tenantId ?? "Shared" }
      ]}
      toFormValues={(record) => ({
        id: record?.id ?? "",
        name: record?.name ?? "",
        slug: record?.slug ?? "",
        tenantId: record?.tenantId ?? ""
      })}
      toPayload={(values) => values}
      renderRelated={({ related }) => (
        <div className="related-grid">
          <section className="related-panel">
            <h4>Racks</h4>
            <ul>{((related["racks"] as readonly { name: string }[] | undefined) ?? []).map((rack) => <li key={rack.name}>{rack.name}</li>)}</ul>
          </section>
          <section className="related-panel">
            <h4>Devices</h4>
            <ul>{((related["devices"] as readonly { name: string }[] | undefined) ?? []).map((device) => <li key={device.name}>{device.name}</li>)}</ul>
          </section>
        </div>
      )}
    />
  );
}
