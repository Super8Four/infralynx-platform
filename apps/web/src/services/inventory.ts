import { requestJson } from "./api-client";

export type InventoryResource =
  | "tenants"
  | "users"
  | "sites"
  | "racks"
  | "devices"
  | "vrfs"
  | "prefixes"
  | "ip-addresses"
  | "interfaces"
  | "connections";

export interface InventoryListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly direction?: "asc" | "desc";
  readonly query?: string;
  readonly filters?: Record<string, string>;
}

export interface InventoryListResponse<TRecord> {
  readonly resource: InventoryResource;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly sort: {
    readonly field: string;
    readonly direction: "asc" | "desc";
  };
  readonly filters: Record<string, string>;
  readonly items: readonly TRecord[];
}

export interface InventoryDetailResponse<TRecord> {
  readonly resource: InventoryResource;
  readonly record: TRecord;
  readonly related: Record<string, unknown>;
}

export interface InventoryNavigationResponse {
  readonly generatedAt: string;
  readonly sections: Record<string, readonly { id: string; label: string; count: number | null }[]>;
}

function toQueryString(query: InventoryListQuery): string {
  const params = new URLSearchParams();

  if (query.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }
  if (query.sort) {
    params.set("sort", query.sort);
  }
  if (query.direction) {
    params.set("direction", query.direction);
  }
  if (query.query) {
    params.set("query", query.query);
  }

  Object.entries(query.filters ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function fetchInventoryNavigation() {
  return requestJson<InventoryNavigationResponse>("/api/inventory/navigation");
}

export async function fetchInventoryList<TRecord>(
  resource: InventoryResource,
  query: InventoryListQuery
) {
  return requestJson<InventoryListResponse<TRecord>>(`/api/inventory/${resource}${toQueryString(query)}`);
}

export async function fetchInventoryDetail<TRecord>(resource: InventoryResource, id: string) {
  return requestJson<InventoryDetailResponse<TRecord>>(`/api/inventory/${resource}/${id}`);
}

export async function createInventoryRecord<TRecord>(
  resource: Extract<InventoryResource, "sites" | "racks" | "devices" | "prefixes" | "ip-addresses">,
  payload: Record<string, unknown>
) {
  return requestJson<InventoryDetailResponse<TRecord>>(`/api/inventory/${resource}`, {
    method: "POST",
    body: payload
  });
}

export async function updateInventoryRecord<TRecord>(
  resource: Extract<InventoryResource, "sites" | "racks" | "devices" | "prefixes" | "ip-addresses">,
  id: string,
  payload: Record<string, unknown>
) {
  return requestJson<InventoryDetailResponse<TRecord>>(`/api/inventory/${resource}/${id}`, {
    method: "PUT",
    body: payload
  });
}

export async function deleteInventoryRecord(
  resource: Extract<InventoryResource, "sites" | "racks" | "devices" | "prefixes" | "ip-addresses">,
  id: string
) {
  return requestJson<{ readonly resource: string; readonly deletedId: string }>(
    `/api/inventory/${resource}/${id}`,
    {
      method: "DELETE"
    }
  );
}
