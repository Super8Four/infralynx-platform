import { useEffect, useReducer, useState } from "react";

import {
  fetchDomainOverview,
  toErrorMessage,
  type UiOverviewModel
} from "../services/domain-overview.js";
import {
  createInitialDomainOverviewState,
  domainOverviewReducer
} from "../state/domain-overview-state.js";

export interface UseDomainOverviewResult {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiOverviewModel | null;
  readonly errorMessage: string | null;
  readonly retry: () => void;
}

export function useDomainOverview(): UseDomainOverviewResult {
  const [state, dispatch] = useReducer(
    domainOverviewReducer,
    undefined,
    createInitialDomainOverviewState
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    dispatch({ type: "load_started" });

    fetchDomainOverview(controller.signal)
      .then((payload) => {
        dispatch({ type: "load_succeeded", payload });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        dispatch({ type: "load_failed", message: toErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  return {
    ...state,
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1)
  };
}
