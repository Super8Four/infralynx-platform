import type { ReactNode } from "react";

export interface DataColumn<TRecord> {
  readonly id: string;
  readonly label: string;
  readonly sortable?: boolean;
  readonly render: (record: TRecord) => ReactNode;
}

interface DataTableProps<TRecord> {
  readonly columns: readonly DataColumn<TRecord>[];
  readonly records: readonly TRecord[];
  readonly sortField: string;
  readonly sortDirection: "asc" | "desc";
  readonly onSort: (field: string) => void;
  readonly onRowSelect?: (record: TRecord) => void;
  readonly getRowKey: (record: TRecord) => string;
  readonly emptyState: string;
}

export function DataTable<TRecord>({
  columns,
  records,
  sortField,
  sortDirection,
  onSort,
  onRowSelect,
  getRowKey,
  emptyState
}: DataTableProps<TRecord>) {
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id}>
                {column.sortable ? (
                  <button
                    className="data-table__sort"
                    type="button"
                    onClick={() => onSort(column.id)}
                  >
                    <span>{column.label}</span>
                    <span className="data-table__sort-indicator">
                      {sortField === column.id ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                ) : (
                  <span>{column.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td className="data-table__empty" colSpan={columns.length}>
                {emptyState}
              </td>
            </tr>
          ) : (
            records.map((record) => (
              <tr
                key={getRowKey(record)}
                className={onRowSelect ? "data-table__row data-table__row--interactive" : "data-table__row"}
                onClick={onRowSelect ? () => onRowSelect(record) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.id}>{column.render(record)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
