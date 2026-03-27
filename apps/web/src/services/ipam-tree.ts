import { fetchJson, ApiClientError } from "./api-client.js";

import {
  createInitialExpandedIpamTree,
  createIpamTreeModel,
  flattenIpamTree,
  type FlattenedIpamTreeRow,
  type IpamTreeAddressSource,
  type IpamTreeHierarchy,
  type IpamTreeModel,
  type IpamTreePrefixSource,
  type IpamTreeUtilization,
  type IpamTreeVrfSource
} from "../../../../packages/ui/dist/index.js";

export interface ApiIpamTreeResponse {
  readonly generatedAt: string;
  readonly vrfs: readonly IpamTreeVrfSource[];
  readonly prefixes: readonly IpamTreePrefixSource[];
  readonly ipAddresses: readonly IpamTreeAddressSource[];
  readonly hierarchy: IpamTreeHierarchy;
  readonly utilization: readonly IpamTreeUtilization[];
  readonly guidance: readonly string[];
}

export interface UiIpamTreeModel {
  readonly syncedAt: string;
  readonly tree: IpamTreeModel;
  readonly rows: readonly FlattenedIpamTreeRow[];
  readonly expandedIds: ReadonlySet<string>;
  readonly guidance: readonly string[];
}

export function normalizeIpamTreeResponse(payload: ApiIpamTreeResponse): UiIpamTreeModel {
  const tree = createIpamTreeModel(
    payload.vrfs,
    payload.hierarchy,
    new Map(payload.utilization.map((entry) => [entry.prefixId, entry])),
    payload.ipAddresses
  );
  const expandedIds = createInitialExpandedIpamTree(tree);

  return {
    syncedAt: payload.generatedAt,
    tree,
    rows: flattenIpamTree(tree, expandedIds),
    expandedIds,
    guidance: payload.guidance
  };
}

export async function fetchIpamTree(signal?: AbortSignal): Promise<UiIpamTreeModel> {
  const payload = await fetchJson<ApiIpamTreeResponse>("/api/ipam-tree/demo", signal);

  return normalizeIpamTreeResponse(payload);
}

export function toIpamTreeErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "InfraLynx could not render the IPAM hierarchy payload.";
}
