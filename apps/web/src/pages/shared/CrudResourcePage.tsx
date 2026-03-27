import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";

import { DetailSection } from "../../components/detail/DetailSection";
import { EntityForm, type FormFieldDefinition } from "../../components/forms/EntityForm";
import { DataTable, type DataColumn } from "../../components/tables/DataTable";
import {
  createInventoryRecord,
  deleteInventoryRecord,
  fetchInventoryDetail,
  fetchInventoryList,
  type InventoryListResponse,
  type InventoryResource,
  updateInventoryRecord
} from "../../services/inventory";
import { ApiClientError } from "../../services/api-client";

export interface FilterDefinition {
  readonly id: string;
  readonly label: string;
  readonly options: readonly { value: string; label: string }[];
}

interface CrudResourcePageProps<TListRecord extends object, TDetailRecord extends object> {
  readonly resource: Extract<InventoryResource, "sites" | "racks" | "devices" | "prefixes" | "ip-addresses">;
  readonly routeBase: string;
  readonly title: string;
  readonly singularLabel: string;
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
  readonly columns: readonly DataColumn<TListRecord>[];
  readonly fields: readonly FormFieldDefinition[];
  readonly filters?: readonly FilterDefinition[];
  readonly detailFields: (record: TDetailRecord) => readonly { label: string; value: string }[];
  readonly toFormValues: (record: TDetailRecord | null) => Record<string, string>;
  readonly toPayload: (values: Record<string, string>) => Record<string, unknown>;
  readonly renderRelated?: (detail: { record: TDetailRecord; related: Record<string, unknown> }) => ReactNode;
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function toErrorMap(error: unknown): Record<string, string> {
  if (
    error instanceof ApiClientError &&
    error.details &&
    typeof error.details === "object" &&
    "error" in error.details
  ) {
    const fields = (error.details as { readonly error?: { readonly fields?: readonly { field: string; message: string }[] } }).error?.fields;

    if (fields) {
      return Object.fromEntries(fields.map((field) => [field.field, field.message]));
    }
  }

  return {};
}

export function CrudResourcePage<TListRecord extends object, TDetailRecord extends object>({
  resource,
  routeBase,
  title,
  singularLabel,
  mode,
  recordId,
  columns,
  fields,
  filters = [],
  detailFields,
  toFormValues,
  toPayload,
  renderRelated
}: CrudResourcePageProps<TListRecord, TDetailRecord>) {
  const [listState, setListState] = useState<InventoryListResponse<TListRecord> | null>(null);
  const [detailState, setDetailState] = useState<{ record: TDetailRecord; related: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState(columns.find((column) => column.sortable)?.id ?? "id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const effectiveMode = mode === "edit" && recordId === null ? "new" : mode;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchInventoryList<TListRecord>(resource, {
      page,
      pageSize: 25,
      sort: sortField,
      direction: sortDirection,
      query,
      filters: filterValues
    })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setListState(response);
        });
      })
      .catch((requestError) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unable to load records.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [resource, page, sortField, sortDirection, query, filterValues]);

  useEffect(() => {
    if (!recordId) {
      setDetailState(null);
      setFormValues(toFormValues(null));
      setFormErrors({});
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchInventoryDetail<TDetailRecord>(resource, recordId)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setDetailState(response);
          setFormValues(toFormValues(response.record));
          setFormErrors({});
        });
      })
      .catch((requestError) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Unable to load record detail.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [resource, recordId, toFormValues]);

  const totalPages = useMemo(() => {
    if (!listState) {
      return 1;
    }

    return Math.max(1, Math.ceil(listState.total / listState.pageSize));
  }, [listState]);

  function navigate(path: string) {
    window.location.hash = path;
  }

  function handleSort(field: string) {
    setPage(1);
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  async function handleSubmit() {
    setSaving(true);
    setFormErrors({});
    setError(null);

    try {
      const payload = toPayload(formValues);
      const response =
        effectiveMode === "edit" && recordId
          ? await updateInventoryRecord<TDetailRecord>(resource, recordId, payload)
          : await createInventoryRecord<TDetailRecord>(resource, payload);

      navigate(`/${routeBase}/${asRecord(response.record)["id"]}`);
    } catch (requestError) {
      setFormErrors(toErrorMap(requestError));
      setError(requestError instanceof Error ? requestError.message : "Unable to save record.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!recordId) {
      return;
    }

    if (!window.confirm(`Delete this ${singularLabel.toLowerCase()}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteInventoryRecord(resource, recordId);
      navigate(`/${routeBase}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete record.");
    }
  }

  function renderList() {
    return (
      <div className="page-shell">
        <div className="page-shell__toolbar">
          <div className="page-shell__filters">
            <input
              value={query}
              placeholder={`Search ${title.toLowerCase()}`}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
            />
            {filters.map((filter) => (
              <select
                key={filter.id}
                value={filterValues[filter.id] ?? ""}
                onChange={(event) => {
                  setPage(1);
                  setFilterValues((current) => ({ ...current, [filter.id]: event.target.value }));
                }}
              >
                <option value="">{filter.label}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <button type="button" onClick={() => navigate(`/${routeBase}/new`)}>
            Create {singularLabel}
          </button>
        </div>
        <DataTable
          columns={columns}
          records={listState?.items ?? []}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          getRowKey={(record) => String(asRecord(record)["id"])}
          onRowSelect={(record) => navigate(`/${routeBase}/${asRecord(record)["id"]}`)}
          emptyState={`No ${title.toLowerCase()} matched the current filters.`}
        />
        <div className="page-shell__pagination">
          <span>
            Page {page} of {totalPages}
          </span>
          <div>
            <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderForm() {
    return (
      <EntityForm
        title={`${effectiveMode === "edit" ? "Edit" : "Create"} ${singularLabel}`}
        fields={fields}
        values={formValues}
        errors={formErrors}
        submitLabel={saving ? "Saving…" : effectiveMode === "edit" ? "Save changes" : "Create"}
        onChange={(fieldId, value) => setFormValues((current) => ({ ...current, [fieldId]: value }))}
        onSubmit={handleSubmit}
        onCancel={() => navigate(recordId ? `/${routeBase}/${recordId}` : `/${routeBase}`)}
      />
    );
  }

  function renderDetail() {
    if (!detailState) {
      return null;
    }

    return (
      <div className="page-shell">
        <div className="page-shell__toolbar">
          <div className="page-shell__filters">
            <span className="page-shell__badge">Detail</span>
          </div>
          <div className="page-shell__actions">
            <button type="button" className="button-secondary" onClick={() => navigate(`/${routeBase}/${recordId}/edit`)}>
              Edit
            </button>
            <button type="button" className="button-danger" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </div>
        <DetailSection
          title={String(
            asRecord(detailState.record)["name"] ??
              asRecord(detailState.record)["cidr"] ??
              asRecord(detailState.record)["address"] ??
              asRecord(detailState.record)["id"]
          )}
          fields={detailFields(detailState.record)}
        />
        {renderRelated ? renderRelated(detailState) : null}
      </div>
    );
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="page-section__eyebrow">{title}</p>
          <h2>{title}</h2>
        </div>
        <p className="workspace-page__summary">
          {effectiveMode === "list"
            ? `Manage ${title.toLowerCase()} through a consistent list, detail, and form workflow.`
            : `Edit ${singularLabel.toLowerCase()} data through API-backed forms with validation.`}
        </p>
      </header>
      {error ? <div className="page-shell__error">{error}</div> : null}
      {loading && effectiveMode !== "list" && !detailState ? <div className="page-shell__loading">Loading…</div> : null}
      {effectiveMode === "list" ? renderList() : null}
      {effectiveMode === "new" || effectiveMode === "edit" ? renderForm() : null}
      {effectiveMode === "detail" ? renderDetail() : null}
    </section>
  );
}
