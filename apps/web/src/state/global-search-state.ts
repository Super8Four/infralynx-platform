import {
  createEmptySearchModel,
  type UiSearchDomain,
  type UiSearchModel
} from "../services/search/global-search.js";

export interface GlobalSearchState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly query: string;
  readonly selectedDomain: UiSearchDomain | "all";
  readonly data: UiSearchModel | null;
  readonly errorMessage: string | null;
  readonly selectedResultId: string | null;
}

export type GlobalSearchAction =
  | { readonly type: "query_changed"; readonly query: string }
  | { readonly type: "domain_changed"; readonly domain: UiSearchDomain | "all" }
  | { readonly type: "search_cleared" }
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly payload: UiSearchModel }
  | { readonly type: "load_failed"; readonly message: string }
  | { readonly type: "result_selected"; readonly resultId: string };

function getFirstResultId(payload: UiSearchModel): string | null {
  return payload.groups[0]?.results[0]?.id ?? null;
}

export function createInitialGlobalSearchState(): GlobalSearchState {
  return {
    status: "idle",
    query: "",
    selectedDomain: "all",
    data: createEmptySearchModel(),
    errorMessage: null,
    selectedResultId: null
  };
}

export function globalSearchReducer(
  state: GlobalSearchState,
  action: GlobalSearchAction
): GlobalSearchState {
  switch (action.type) {
    case "query_changed":
      return {
        ...state,
        query: action.query
      };
    case "domain_changed":
      return {
        ...state,
        selectedDomain: action.domain
      };
    case "search_cleared":
      return {
        ...state,
        status: "idle",
        data: createEmptySearchModel(state.selectedDomain, ""),
        errorMessage: null,
        selectedResultId: null
      };
    case "load_started":
      return {
        ...state,
        status: "loading",
        errorMessage: null
      };
    case "load_succeeded":
      return {
        ...state,
        status: "ready",
        data: action.payload,
        errorMessage: null,
        selectedResultId: getFirstResultId(action.payload)
      };
    case "load_failed":
      return {
        ...state,
        status: "error",
        errorMessage: action.message
      };
    case "result_selected":
      return {
        ...state,
        selectedResultId: action.resultId
      };
    default:
      return state;
  }
}
