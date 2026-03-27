import { useDeferredValue, useEffect, useReducer, useState } from "react";

import {
  fetchGlobalSearch,
  toSearchErrorMessage,
  type UiSearchDomain,
  type UiSearchModel
} from "../services/search/global-search.js";
import {
  createInitialGlobalSearchState,
  globalSearchReducer
} from "../state/global-search-state.js";

export interface UseGlobalSearchResult {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly query: string;
  readonly selectedDomain: UiSearchDomain | "all";
  readonly data: UiSearchModel | null;
  readonly errorMessage: string | null;
  readonly selectedResultId: string | null;
  readonly updateQuery: (query: string) => void;
  readonly updateDomain: (domain: UiSearchDomain | "all") => void;
  readonly retry: () => void;
  readonly selectResult: (resultId: string) => void;
}

export function useGlobalSearch(): UseGlobalSearchResult {
  const [state, dispatch] = useReducer(globalSearchReducer, undefined, createInitialGlobalSearchState);
  const [attempt, setAttempt] = useState(0);
  const deferredQuery = useDeferredValue(state.query.trim());

  useEffect(() => {
    if (deferredQuery.length === 0) {
      dispatch({ type: "search_cleared" });
      return;
    }

    const controller = new AbortController();

    dispatch({ type: "load_started" });

    fetchGlobalSearch(deferredQuery, state.selectedDomain, controller.signal)
      .then((payload) => {
        dispatch({ type: "load_succeeded", payload });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        dispatch({ type: "load_failed", message: toSearchErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt, deferredQuery, state.selectedDomain]);

  return {
    ...state,
    updateQuery: (query) => dispatch({ type: "query_changed", query }),
    updateDomain: (domain) => dispatch({ type: "domain_changed", domain }),
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1),
    selectResult: (resultId) => dispatch({ type: "result_selected", resultId })
  };
}
