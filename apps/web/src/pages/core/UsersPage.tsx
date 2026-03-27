import { ReadOnlyResourcePage } from "../shared/ReadOnlyResourcePage";

interface UserRecord {
  readonly id: string;
  readonly displayName: string;
  readonly subject: string;
  readonly tenantId: string;
  readonly status: string;
}

export function UsersPage() {
  return (
    <ReadOnlyResourcePage<UserRecord>
      resource="users"
      title="Users"
      columns={[
        { id: "displayName", label: "Name", sortable: true, render: (record) => record.displayName },
        { id: "subject", label: "Subject", sortable: true, render: (record) => record.subject },
        { id: "tenantId", label: "Tenant", sortable: true, render: (record) => record.tenantId },
        { id: "status", label: "Status", sortable: true, render: (record) => record.status }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Name", value: record.displayName },
        { label: "Subject", value: record.subject },
        { label: "Tenant", value: record.tenantId },
        { label: "Status", value: record.status }
      ]}
    />
  );
}
