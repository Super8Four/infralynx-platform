import { useEffect, useReducer, useState } from "react";

import { type TopologyFilterModel } from "../../../../packages/ui/dist/index.js";
import {
  fetchTopologyGraph,
  toTopologyErrorMessage,
  type UiTopologyModel
} from "../services/topology-graph.js";
import {
  createInitialTopologyGraphState,
  topologyGraphReducer,
  type TopologyViewport
} from "../state/topology-graph-state.js";

export interface UseTopologyGraphResult {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiTopologyModel | null;
  readonly errorMessage: string | null;
  readonly selectedNodeId: string | null;
  readonly filter: TopologyFilterModel;
  readonly viewport: TopologyViewport;
  readonly retry: () => void;
  readonly selectNode: (nodeId: string) => void;
  readonly updateFilter: (filter: TopologyFilterModel) => void;
  readonly updateViewport: (viewport: TopologyViewport) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetViewport: () => void;
}

export function useTopologyGraph(): UseTopologyGraphResult {
  const [state, dispatch] = useReducer(
    topologyGraphReducer,
    undefined,
    createInitialTopologyGraphState
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    dispatch({ type: "load_started" });

    fetchTopologyGraph(controller.signal)
      .then((payload) => {
        dispatch({ type: "load_succeeded", payload });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        dispatch({ type: "load_failed", message: toTopologyErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  return {
    ...state,
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1),
    selectNode: (nodeId) => dispatch({ type: "node_selected", nodeId }),
    updateFilter: (filter) => dispatch({ type: "filter_changed", filter }),
    updateViewport: (viewport) => dispatch({ type: "viewport_changed", viewport }),
    zoomIn: () => dispatch({ type: "zoom_in" }),
    zoomOut: () => dispatch({ type: "zoom_out" }),
    resetViewport: () => dispatch({ type: "viewport_reset" })
  };
}
