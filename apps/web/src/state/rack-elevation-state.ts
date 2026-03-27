import type { UiRackModel } from "../services/rack-elevation.js";

export interface RackElevationState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiRackModel | null;
  readonly errorMessage: string | null;
  readonly selectedDeviceId: string | null;
  readonly selectedPortId: string | null;
}

export type RackElevationAction =
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly payload: UiRackModel }
  | { readonly type: "load_failed"; readonly message: string }
  | { readonly type: "device_selected"; readonly deviceId: string }
  | { readonly type: "port_selected"; readonly deviceId: string; readonly portId: string };

export function createInitialRackElevationState(): RackElevationState {
  return {
    status: "idle",
    data: null,
    errorMessage: null,
    selectedDeviceId: null,
    selectedPortId: null
  };
}

export function rackElevationReducer(
  state: RackElevationState,
  action: RackElevationAction
): RackElevationState {
  switch (action.type) {
    case "load_started":
      return { ...state, status: "loading", errorMessage: null };
    case "load_succeeded":
      return {
        status: "ready",
        data: action.payload,
        errorMessage: null,
        selectedDeviceId: action.payload.rack.devices[0]?.id ?? null,
        selectedPortId: action.payload.rack.devices[0]?.ports[0]?.id ?? null
      };
    case "load_failed":
      return { ...state, status: "error", errorMessage: action.message };
    case "device_selected":
      return {
        ...state,
        selectedDeviceId: action.deviceId,
        selectedPortId:
          state.data?.rack.devices.find((device) => device.id === action.deviceId)?.ports[0]?.id ?? null
      };
    case "port_selected":
      return {
        ...state,
        selectedDeviceId: action.deviceId,
        selectedPortId: action.portId
      };
    default:
      return state;
  }
}
