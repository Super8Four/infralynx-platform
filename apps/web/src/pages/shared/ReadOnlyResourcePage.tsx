import { useEffect, useState } from "react";

import { DetailSection } from "../../components/detail/DetailSection";
import { DataTable, type DataColumn } from "../../components/tables/DataTable";
import { fetchInventoryDetail, fetchInventoryList, type InventoryResource } from "../../services/inventory";

interface ReadOnlyResourcePageProps<TRecord extends object> {
  readonly resource: Extract<InventoryResource, "tenants" | "users" | "vrfs" | "interfaces" | "connections">;
  readonly title: string;
  readonly columns: readonly DataColumn<TRecord>[];
  readonly detailFields: (record: TRecord) => readonly { label: string; value: string }[];
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function ReadOnlyResourcePage<TRecord extends object>({
  resource,
  title,
  columns,
  detailFields
}: ReadOnlyResourcePageProps<TRecord>) {
  const [records, setRecords] = useState<readonly TRecord[]>([]);
  const [selected, setSelected] = useState<{ record: TRecord; related: Record<string, unknown> } | null>(null);
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState(columns.find((column) => column.sortable)?.id ?? "id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    void fetchInventoryList<TRecord>(resource, {
      query,
      sort: sortField,
      direction: sortDirection,
      page: 1,
      pageSize: 50
    }).then((response) => {
      setRecords(response.items);
      if (!selected && response.items.length > 0) {
        void fetchInventoryDetail<TRecord>(
          resource,
          String(asRecord(response.items[0] as object)["id"])
        ).then(setSelected);
      }
    });
  }, [resource, query, sortField, sortDirection]);

  function handleSort(field: string) {
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">{title}</p>
          <h2>{title}</h2>
        </div>
        <p className="workspace-page__summary">
          Read-only platform data exposed through the same API-backed interaction model.
        </p>
      </header>
      <div className="page-shell">
        <div className="page-shell__toolbar">
          <div className="page-shell__filters">
            <input
              value={query}
              placeholder={`Search ${title.toLowerCase()}`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          records={records}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          getRowKey={(record) => String(asRecord(record)["id"])}
          onRowSelect={(record) => {
            void fetchInventoryDetail<TRecord>(resource, String(asRecord(record)["id"])).then(setSelected);
          }}
          emptyState={`No ${title.toLowerCase()} matched the current filters.`}
        />
        {selected ? (
          <DetailSection
            title={String(
              asRecord(selected.record)["name"] ??
                asRecord(selected.record)["displayName"] ??
                asRecord(selected.record)["label"] ??
                asRecord(selected.record)["id"]
            )}
            fields={detailFields(selected.record)}
          />
        ) : null}
      </div>
    </section>
  );
}
