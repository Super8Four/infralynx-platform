import { ApiClientError, fetchJson } from "../api-client.js";

export type UiSearchDomain = "core" | "ipam" | "dcim" | "operations" | "automation";

export interface ApiSearchFilterOptionResponse {
  readonly value: UiSearchDomain | "all";
  readonly label: string;
  readonly count: number;
}

export interface ApiSearchResultResponse {
  readonly id: string;
  readonly domain: UiSearchDomain;
  readonly domainLabel: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly location: string;
  readonly status: string | null;
  readonly matchedTerms: readonly string[];
  readonly tags: readonly string[];
  readonly score: number;
}

export interface ApiSearchResultGroupResponse {
  readonly domain: UiSearchDomain;
  readonly label: string;
  readonly results: readonly ApiSearchResultResponse[];
}

export interface ApiSearchResponse {
  readonly generatedAt: string;
  readonly query: string;
  readonly selectedDomain: UiSearchDomain | "all";
  readonly totalResults: number;
  readonly availableDomains: readonly ApiSearchFilterOptionResponse[];
  readonly groups: readonly ApiSearchResultGroupResponse[];
  readonly guidance: readonly string[];
}

export interface UiSearchFilterOption {
  readonly value: UiSearchDomain | "all";
  readonly label: string;
  readonly count: number;
}

export interface UiSearchResult {
  readonly id: string;
  readonly domain: UiSearchDomain;
  readonly domainLabel: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly location: string;
  readonly statusLabel: string;
  readonly statusTone: "live" | "warning" | "planned";
  readonly matchedTerms: readonly string[];
  readonly tags: readonly string[];
  readonly score: number;
}

export interface UiSearchGroup {
  readonly domain: UiSearchDomain;
  readonly label: string;
  readonly count: number;
  readonly results: readonly UiSearchResult[];
}

export interface UiSearchModel {
  readonly syncedAt: string;
  readonly query: string;
  readonly selectedDomain: UiSearchDomain | "all";
  readonly totalResults: number;
  readonly filters: readonly UiSearchFilterOption[];
  readonly groups: readonly UiSearchGroup[];
  readonly guidance: readonly string[];
}

function toStatusLabel(status: string | null): string {
  if (!status) {
    return "Reference";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function toStatusTone(status: string | null): UiSearchResult["statusTone"] {
  if (status === "planned") {
    return "planned";
  }

  if (status === "reserved" || status === "deprecated" || status === "suspended" || status === "retired") {
    return "warning";
  }

  return "live";
}

export function createEmptySearchModel(
  selectedDomain: UiSearchDomain | "all" = "all",
  query = ""
): UiSearchModel {
  return {
    syncedAt: new Date(0).toISOString(),
    query,
    selectedDomain,
    totalResults: 0,
    filters: [
      { value: "all", label: "All domains", count: 0 },
      { value: "core", label: "Core Platform", count: 0 },
      { value: "ipam", label: "IPAM", count: 0 },
      { value: "dcim", label: "DCIM", count: 0 },
      { value: "operations", label: "Operations", count: 0 },
      { value: "automation", label: "Automation", count: 0 }
    ],
    groups: [],
    guidance: [
      "Search is ready for centralized domain queries.",
      "Results will group by domain once the first query is entered."
    ]
  };
}

export function normalizeSearchResponse(payload: ApiSearchResponse): UiSearchModel {
  return {
    syncedAt: payload.generatedAt,
    query: payload.query,
    selectedDomain: payload.selectedDomain,
    totalResults: payload.totalResults,
    filters: payload.availableDomains.map((filter) => ({
      value: filter.value,
      label: filter.label,
      count: filter.count
    })),
    groups: payload.groups.map((group) => ({
      domain: group.domain,
      label: group.label,
      count: group.results.length,
      results: group.results.map((result) => ({
        id: result.id,
        domain: result.domain,
        domainLabel: result.domainLabel,
        kind: result.kind,
        title: result.title,
        summary: result.summary,
        location: result.location,
        statusLabel: toStatusLabel(result.status),
        statusTone: toStatusTone(result.status),
        matchedTerms: result.matchedTerms,
        tags: result.tags,
        score: result.score
      }))
    })),
    guidance: payload.guidance
  };
}

export async function fetchGlobalSearch(
  query: string,
  domain: UiSearchDomain | "all",
  signal?: AbortSignal
): Promise<UiSearchModel> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return createEmptySearchModel(domain, "");
  }

  const searchParams = new URLSearchParams({
    q: trimmedQuery,
    domain
  });
  const payload = await fetchJson<ApiSearchResponse>(`/api/search?${searchParams.toString()}`, signal);

  return normalizeSearchResponse(payload);
}

export function toSearchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "InfraLynx was unable to assemble the global search result set.";
}
