import { fetchJson, ApiClientError } from "./api-client.js";

export interface ApiRackPortResponse {
  readonly id: string;
  readonly label: string;
  readonly side: "left" | "right";
  readonly status: "connected" | "available" | "disabled";
  readonly cableId: string | null;
  readonly peerPortLabel: string | null;
}

export interface ApiRackDeviceResponse {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tone: "network" | "compute" | "power" | "storage";
  readonly startUnit: number;
  readonly heightUnits: number;
  readonly ports: readonly ApiRackPortResponse[];
}

export interface ApiRackCableResponse {
  readonly id: string;
  readonly fromDeviceId: string;
  readonly fromPortId: string;
  readonly fromPortLabel: string;
  readonly toDeviceId: string;
  readonly toPortId: string;
  readonly toPortLabel: string;
}

export interface ApiRackResponse {
  readonly generatedAt: string;
  readonly rack: {
    readonly id: string;
    readonly name: string;
    readonly siteName: string;
    readonly totalUnits: number;
    readonly devices: readonly ApiRackDeviceResponse[];
    readonly cables: readonly ApiRackCableResponse[];
  };
  readonly guidance: readonly string[];
}

export interface UiRackModel {
  readonly syncedAt: string;
  readonly rack: ApiRackResponse["rack"];
  readonly guidance: readonly string[];
}

export function normalizeRackResponse(payload: ApiRackResponse): UiRackModel {
  return {
    syncedAt: payload.generatedAt,
    rack: payload.rack,
    guidance: payload.guidance
  };
}

export async function fetchRackElevation(signal?: AbortSignal): Promise<UiRackModel> {
  const payload = await fetchJson<ApiRackResponse>("/api/racks/demo", signal);

  return normalizeRackResponse(payload);
}

export function toRackErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "InfraLynx could not render the rack elevation payload.";
}
