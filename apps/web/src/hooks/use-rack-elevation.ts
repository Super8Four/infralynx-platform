import { useEffect, useReducer, useState } from "react";

import {
  fetchRackElevation,
  toRackErrorMessage,
  type UiRackModel
} from "../services/rack-elevation.js";
import {
  createInitialRackElevationState,
  rackElevationReducer
} from "../state/rack-elevation-state.js";

export interface UseRackElevationResult {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: UiRackModel | null;
  readonly errorMessage: string | null;
  readonly selectedDeviceId: string | null;
  readonly selectedPortId: string | null;
  readonly retry: () => void;
  readonly selectDevice: (deviceId: string) => void;
  readonly selectPort: (deviceId: string, portId: string) => void;
}

export function useRackElevation(): UseRackElevationResult {
  const [state, dispatch] = useReducer(
    rackElevationReducer,
    undefined,
    createInitialRackElevationState
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    dispatch({ type: "load_started" });

    fetchRackElevation(controller.signal)
      .then((payload) => {
        dispatch({ type: "load_succeeded", payload });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        dispatch({ type: "load_failed", message: toRackErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  return {
    ...state,
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1),
    selectDevice: (deviceId) => dispatch({ type: "device_selected", deviceId }),
    selectPort: (deviceId, portId) => dispatch({ type: "port_selected", deviceId, portId })
  };
}
