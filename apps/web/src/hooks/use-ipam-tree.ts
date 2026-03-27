import { useEffect, useReducer, useState } from "react";

import { fetchIpamTree, toIpamTreeErrorMessage, type UiIpamTreeModel } from "../services/ipam-tree.js";
import { createInitialIpamTreeState, ipamTreeReducer } from "../state/ipam-tree-state.js";

export interface UseIpamTreeResult {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiIpamTreeModel | null;
  readonly errorMessage: string | null;
  readonly selectedNodeId: string | null;
  readonly retry: () => void;
  readonly selectNode: (nodeId: string) => void;
  readonly toggleNode: (nodeId: string) => void;
}

export function useIpamTree(): UseIpamTreeResult {
  const [state, dispatch] = useReducer(ipamTreeReducer, undefined, createInitialIpamTreeState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    dispatch({ type: "load_started" });

    fetchIpamTree(controller.signal)
      .then((payload) => {
        dispatch({ type: "load_succeeded", payload });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        dispatch({ type: "load_failed", message: toIpamTreeErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  return {
    ...state,
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1),
    selectNode: (nodeId) => dispatch({ type: "node_selected", nodeId }),
    toggleNode: (nodeId) => dispatch({ type: "node_toggled", nodeId })
  };
}
