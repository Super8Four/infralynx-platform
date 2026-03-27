import { flattenIpamTree } from "../../../../packages/ui/dist/index.js";
import type { UiIpamTreeModel } from "../services/ipam-tree.js";

export interface IpamTreeState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiIpamTreeModel | null;
  readonly errorMessage: string | null;
  readonly selectedNodeId: string | null;
}

export type IpamTreeAction =
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly payload: UiIpamTreeModel }
  | { readonly type: "load_failed"; readonly message: string }
  | { readonly type: "node_selected"; readonly nodeId: string }
  | { readonly type: "node_toggled"; readonly nodeId: string };

export function createInitialIpamTreeState(): IpamTreeState {
  return {
    status: "idle",
    data: null,
    errorMessage: null,
    selectedNodeId: null
  };
}

export function ipamTreeReducer(state: IpamTreeState, action: IpamTreeAction): IpamTreeState {
  switch (action.type) {
    case "load_started":
      return { ...state, status: "loading", errorMessage: null };
    case "load_succeeded":
      return {
        status: "ready",
        data: action.payload,
        errorMessage: null,
        selectedNodeId:
          action.payload.rows.find((row) => row.type === "prefix")?.id ?? null
      };
    case "load_failed":
      return { ...state, status: "error", errorMessage: action.message };
    case "node_selected":
      return { ...state, selectedNodeId: action.nodeId };
    case "node_toggled": {
      if (!state.data) {
        return state;
      }

      const expandedIds = new Set(state.data.expandedIds);

      if (expandedIds.has(action.nodeId)) {
        expandedIds.delete(action.nodeId);
      } else {
        expandedIds.add(action.nodeId);
      }

      const nextData = {
        ...state.data,
        expandedIds,
        rows: flattenIpamTree(state.data.tree, expandedIds)
      };
      const selectedStillVisible = nextData.rows.some((row) => row.id === state.selectedNodeId);

      return {
        ...state,
        data: nextData,
        selectedNodeId:
          selectedStillVisible
            ? state.selectedNodeId
            : nextData.rows.find((row) => row.type === "prefix")?.id ?? null
      };
    }
    default:
      return state;
  }
}
