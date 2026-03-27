import { fetchJson, ApiClientError } from "./api-client.js";

import {
  collectTopologyFilterOptions,
  createDefaultTopologyFilter,
  filterTopologyGraph,
  type TopologyFilterModel,
  type TopologyGraphEdge,
  type TopologyGraphModel,
  type TopologyGraphNode
} from "../../../../packages/ui/dist/index.js";

export type ApiTopologyNodeResponse = TopologyGraphNode;

export type ApiTopologyEdgeResponse = TopologyGraphEdge;

export interface ApiTopologyResponse {
  readonly generatedAt: string;
  readonly graph: TopologyGraphModel;
  readonly guidance: readonly string[];
}

export interface UiTopologyModel {
  readonly syncedAt: string;
  readonly fullGraph: TopologyGraphModel;
  readonly graph: TopologyGraphModel;
  readonly filter: TopologyFilterModel;
  readonly options: ReturnType<typeof collectTopologyFilterOptions>;
  readonly guidance: readonly string[];
}

export function normalizeTopologyResponse(payload: ApiTopologyResponse): UiTopologyModel {
  const filter = createDefaultTopologyFilter();

  return {
    syncedAt: payload.generatedAt,
    fullGraph: payload.graph,
    graph: filterTopologyGraph(payload.graph, filter),
    filter,
    options: collectTopologyFilterOptions(payload.graph),
    guidance: payload.guidance
  };
}

export async function fetchTopologyGraph(signal?: AbortSignal): Promise<UiTopologyModel> {
  const payload = await fetchJson<ApiTopologyResponse>("/api/topology/demo", signal);

  return normalizeTopologyResponse(payload);
}

export function toTopologyErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "InfraLynx could not render the topology graph payload.";
}
