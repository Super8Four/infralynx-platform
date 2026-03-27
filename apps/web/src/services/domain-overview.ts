import { fetchJson, ApiClientError } from "./api-client.js";

export interface ApiMetricResponse {
  readonly label: string;
  readonly value: string;
}

export interface ApiDomainResponse {
  readonly id: string;
  readonly title: string;
  readonly status: "ready" | "attention" | "planned";
  readonly summary: string;
  readonly metrics: readonly ApiMetricResponse[];
  readonly indicators: readonly string[];
}

export interface ApiOverviewResponse {
  readonly generatedAt: string;
  readonly workspace: {
    readonly name: string;
    readonly runtime: string;
    readonly boundary: string;
  };
  readonly domains: readonly ApiDomainResponse[];
  readonly notices: readonly string[];
}

export interface UiMetric {
  readonly label: string;
  readonly value: string;
}

export interface UiDomainSnapshot {
  readonly id: string;
  readonly title: string;
  readonly tone: "live" | "warning" | "planned";
  readonly statusLabel: string;
  readonly summary: string;
  readonly metrics: readonly UiMetric[];
  readonly indicators: readonly string[];
}

export interface UiOverviewModel {
  readonly syncedAt: string;
  readonly workspaceName: string;
  readonly runtime: string;
  readonly boundary: string;
  readonly domains: readonly UiDomainSnapshot[];
  readonly notices: readonly string[];
}

function toDomainTone(status: ApiDomainResponse["status"]): UiDomainSnapshot["tone"] {
  if (status === "attention") {
    return "warning";
  }

  return status === "planned" ? "planned" : "live";
}

function toStatusLabel(status: ApiDomainResponse["status"]): string {
  if (status === "attention") {
    return "Needs attention";
  }

  return status === "planned" ? "Planned" : "Live";
}

export function normalizeOverviewResponse(payload: ApiOverviewResponse): UiOverviewModel {
  return {
    syncedAt: payload.generatedAt,
    workspaceName: payload.workspace.name,
    runtime: payload.workspace.runtime,
    boundary: payload.workspace.boundary,
    domains: payload.domains.map((domain) => ({
      id: domain.id,
      title: domain.title,
      tone: toDomainTone(domain.status),
      statusLabel: toStatusLabel(domain.status),
      summary: domain.summary,
      metrics: domain.metrics.slice(0, 3).map((metric) => ({
        label: metric.label,
        value: metric.value
      })),
      indicators: domain.indicators.slice(0, 3)
    })),
    notices: payload.notices.slice(0, 3)
  };
}

export async function fetchDomainOverview(signal?: AbortSignal): Promise<UiOverviewModel> {
  const payload = await fetchJson<ApiOverviewResponse>("/api/overview", signal);

  return normalizeOverviewResponse(payload);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "InfraLynx was unable to normalize the latest domain payload.";
}
