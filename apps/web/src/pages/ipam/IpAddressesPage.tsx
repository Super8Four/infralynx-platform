import { CrudResourcePage } from "../shared/CrudResourcePage";

interface IpAddressRecord {
  readonly id: string;
  readonly address: string;
  readonly vrfId: string | null;
  readonly prefixId: string | null;
  readonly prefixCidr?: string | null;
  readonly interfaceId: string | null;
  readonly interfaceName?: string | null;
  readonly deviceName?: string | null;
  readonly status: string;
  readonly role: string;
}

export function IpAddressesPage({
  mode,
  recordId
}: {
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}) {
  return (
    <CrudResourcePage<IpAddressRecord, IpAddressRecord>
      resource="ip-addresses"
      routeBase="ip-addresses"
      title="IP Addresses"
      singularLabel="IP Address"
      mode={mode}
      recordId={recordId}
      columns={[
        { id: "address", label: "Address", sortable: true, render: (record) => record.address },
        { id: "prefixCidr", label: "Prefix", sortable: true, render: (record) => record.prefixCidr ?? record.prefixId ?? "Unassigned" },
        { id: "deviceName", label: "Device", sortable: true, render: (record) => record.deviceName ?? "Unassigned" },
        { id: "status", label: "Status", sortable: true, render: (record) => record.status }
      ]}
      fields={[
        { id: "id", label: "ID" },
        { id: "address", label: "Address", required: true },
        { id: "vrfId", label: "VRF ID" },
        { id: "prefixId", label: "Prefix ID" },
        { id: "interfaceId", label: "Interface ID" },
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
          id: "role",
          label: "Role",
          type: "select",
          required: true,
          options: [
            { value: "primary", label: "Primary" },
            { value: "secondary", label: "Secondary" },
            { value: "loopback", label: "Loopback" },
            { value: "vip", label: "VIP" }
          ]
        }
      ]}
      detailFields={(record) => [
        { label: "ID", value: record.id },
        { label: "Address", value: record.address },
        { label: "VRF", value: record.vrfId ?? "Global" },
        { label: "Prefix", value: record.prefixCidr ?? record.prefixId ?? "Unassigned" },
        { label: "Device", value: record.deviceName ?? "Unassigned" },
        { label: "Interface", value: record.interfaceName ?? record.interfaceId ?? "Unassigned" },
        { label: "Status", value: record.status },
        { label: "Role", value: record.role }
      ]}
      toFormValues={(record) => ({
        id: record?.id ?? "",
        address: record?.address ?? "",
        vrfId: record?.vrfId ?? "",
        prefixId: record?.prefixId ?? "",
        interfaceId: record?.interfaceId ?? "",
        status: record?.status ?? "active",
        role: record?.role ?? "primary"
      })}
      toPayload={(values) => values}
    />
  );
}
