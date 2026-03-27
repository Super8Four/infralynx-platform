import { ReadOnlyResourcePage } from "../shared/ReadOnlyResourcePage";

interface TenantRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
}

export function TenantsPage() {
  return (
    <ReadOnlyResourcePage<TenantRecord>
      resource="tenants"
      title="Tenants"
      columns={[
        { id: "name", label: "Name", sortable: true, render: (record) => record.name },
        { id: "slug", label: "Slug", sortable: true, render: (record) => record.slug },
        { id: "status", label: "Status", sortable: true, render: (record) => record.status }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.name },
        { label: "Slug", value: record.slug },
        { label: "Status", value: record.status }
      ]}
    />
  );
}
