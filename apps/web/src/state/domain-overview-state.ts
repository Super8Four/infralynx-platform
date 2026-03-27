import type { UiOverviewModel } from "../services/domain-overview.js";

export interface DomainOverviewState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiOverviewModel | null;
  readonly errorMessage: string | null;
}

export type DomainOverviewAction =
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly payload: UiOverviewModel }
  | { readonly type: "load_failed"; readonly message: string };

export function createInitialDomainOverviewState(): DomainOverviewState {
  return {
    status: "idle",
    data: null,
    errorMessage: null
  };
}

export function domainOverviewReducer(
  state: DomainOverviewState,
  action: DomainOverviewAction
): DomainOverviewState {
  switch (action.type) {
    case "load_started":
      return {
        ...state,
        status: "loading",
        errorMessage: null
      };
    case "load_succeeded":
      return {
        status: "ready",
        data: action.payload,
        errorMessage: null
      };
    case "load_failed":
      return {
        ...state,
        status: "error",
        errorMessage: action.message
      };
    default:
      return state;
  }
}
