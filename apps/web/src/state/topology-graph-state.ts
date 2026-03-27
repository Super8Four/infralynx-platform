import {
  createDefaultTopologyFilter,
  filterTopologyGraph,
  type TopologyFilterModel
} from "../../../../packages/ui/dist/index.js";
import type { UiTopologyModel } from "../services/topology-graph.js";

export interface TopologyViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface TopologyGraphState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiTopologyModel | null;
  readonly errorMessage: string | null;
  readonly selectedNodeId: string | null;
  readonly filter: TopologyFilterModel;
  readonly viewport: TopologyViewport;
}

export type TopologyGraphAction =
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly payload: UiTopologyModel }
  | { readonly type: "load_failed"; readonly message: string }
  | { readonly type: "node_selected"; readonly nodeId: string }
  | { readonly type: "filter_changed"; readonly filter: TopologyFilterModel }
  | { readonly type: "viewport_changed"; readonly viewport: TopologyViewport }
  | { readonly type: "zoom_in" }
  | { readonly type: "zoom_out" }
  | { readonly type: "viewport_reset" };

function applyFilter(data: UiTopologyModel, filter: TopologyFilterModel): UiTopologyModel {
  return {
    ...data,
    filter,
    graph: filterTopologyGraph(data.fullGraph, filter)
  };
}

export function createInitialTopologyGraphState(): TopologyGraphState {
  return {
    status: "idle",
    data: null,
    errorMessage: null,
    selectedNodeId: null,
    filter: createDefaultTopologyFilter(),
    viewport: {
      scale: 1,
      offsetX: 0,
      offsetY: 0
    }
  };
}

export function topologyGraphReducer(
  state: TopologyGraphState,
  action: TopologyGraphAction
): TopologyGraphState {
  switch (action.type) {
    case "load_started":
      return { ...state, status: "loading", errorMessage: null };
    case "load_succeeded": {
      const firstNodeId = action.payload.graph.nodes[0]?.id ?? null;

      return {
        status: "ready",
        data: action.payload,
        errorMessage: null,
        selectedNodeId: firstNodeId,
        filter: action.payload.filter,
        viewport: {
          scale: 1,
          offsetX: 0,
          offsetY: 0
        }
      };
    }
    case "load_failed":
      return { ...state, status: "error", errorMessage: action.message };
    case "node_selected":
      return {
        ...state,
        selectedNodeId: action.nodeId
      };
    case "filter_changed": {
      if (!state.data) {
        return state;
      }

      const filtered = applyFilter(state.data, action.filter);
      const selectedNodeStillVisible = filtered.graph.nodes.some((node) => node.id === state.selectedNodeId);

      return {
        ...state,
        data: filtered,
        filter: action.filter,
        selectedNodeId: selectedNodeStillVisible ? state.selectedNodeId : filtered.graph.nodes[0]?.id ?? null
      };
    }
    case "viewport_changed":
      return {
        ...state,
        viewport: action.viewport
      };
    case "zoom_in":
      return {
        ...state,
        viewport: {
          ...state.viewport,
          scale: Math.min(1.8, Number((state.viewport.scale + 0.15).toFixed(2)))
        }
      };
    case "zoom_out":
      return {
        ...state,
        viewport: {
          ...state.viewport,
          scale: Math.max(0.65, Number((state.viewport.scale - 0.15).toFixed(2)))
        }
      };
    case "viewport_reset":
      return {
        ...state,
        viewport: {
          scale: 1,
          offsetX: 0,
          offsetY: 0
        }
      };
    default:
      return state;
  }
}
