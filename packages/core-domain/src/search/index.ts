export type SearchDomain = "core" | "ipam" | "dcim" | "operations" | "automation";

export interface SearchRecord {
  readonly id: string;
  readonly domain: SearchDomain;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly location: string;
  readonly keywords: readonly string[];
  readonly tags: readonly string[];
  readonly status: string | null;
}

export interface SearchQuery {
  readonly text: string;
  readonly tokens: readonly string[];
  readonly domain: SearchDomain | "all";
}

export interface SearchMatch {
  readonly record: SearchRecord;
  readonly score: number;
  readonly matchedTerms: readonly string[];
}

export interface SearchResultGroup {
  readonly domain: SearchDomain;
  readonly label: string;
  readonly results: readonly SearchMatch[];
}

const searchDomainOrder: readonly SearchDomain[] = [
  "core",
  "ipam",
  "dcim",
  "operations",
  "automation"
] as const;

const searchDomainLabels: Record<SearchDomain, string> = {
  core: "Core Platform",
  ipam: "IPAM",
  dcim: "DCIM",
  operations: "Operations",
  automation: "Automation"
};

function compareSearchDomains(left: SearchDomain, right: SearchDomain): number {
  return searchDomainOrder.indexOf(left) - searchDomainOrder.indexOf(right);
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenizeSearchText(value: string): readonly string[] {
  const normalized = normalizeSearchText(value);

  return normalized.length === 0 ? [] : normalized.split(" ");
}

export function createSearchQuery(text: string, domain: SearchDomain | "all" = "all"): SearchQuery {
  return {
    text: normalizeSearchText(text),
    tokens: tokenizeSearchText(text),
    domain
  };
}

function createSearchCorpus(record: SearchRecord): string {
  return normalizeSearchText(
    [
      record.title,
      record.summary,
      record.location,
      record.kind,
      ...record.keywords,
      ...record.tags,
      record.status ?? ""
    ].join(" ")
  );
}

function scoreSearchRecord(record: SearchRecord, query: SearchQuery): SearchMatch | null {
  if (query.domain !== "all" && record.domain !== query.domain) {
    return null;
  }

  if (query.tokens.length === 0) {
    return null;
  }

  const title = normalizeSearchText(record.title);
  const summary = normalizeSearchText(record.summary);
  const location = normalizeSearchText(record.location);
  const corpus = createSearchCorpus(record);
  const matchedTerms: string[] = [];
  let score = 0;

  for (const token of query.tokens) {
    if (!corpus.includes(token)) {
      return null;
    }

    matchedTerms.push(token);

    if (title === token) {
      score += 18;
      continue;
    }

    if (title.startsWith(token)) {
      score += 12;
      continue;
    }

    if (title.includes(token)) {
      score += 9;
      continue;
    }

    if (location.includes(token)) {
      score += 7;
      continue;
    }

    if (summary.includes(token)) {
      score += 5;
      continue;
    }

    score += 3;
  }

  score += Math.max(0, 5 - Math.min(record.tags.length, 5));

  return {
    record,
    score,
    matchedTerms: [...new Set(matchedTerms)]
  };
}

export function searchRecords(records: readonly SearchRecord[], query: SearchQuery): readonly SearchMatch[] {
  return records
    .map((record) => scoreSearchRecord(record, query))
    .filter((match): match is SearchMatch => match !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const domainComparison = compareSearchDomains(left.record.domain, right.record.domain);

      if (domainComparison !== 0) {
        return domainComparison;
      }

      const titleComparison = left.record.title.localeCompare(right.record.title);

      if (titleComparison !== 0) {
        return titleComparison;
      }

      return left.record.id.localeCompare(right.record.id);
    });
}

export function groupSearchResults(matches: readonly SearchMatch[]): readonly SearchResultGroup[] {
  const grouped = new Map<SearchDomain, SearchMatch[]>();

  for (const match of matches) {
    const current = grouped.get(match.record.domain) ?? [];
    current.push(match);
    grouped.set(match.record.domain, current);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => compareSearchDomains(left, right))
    .map(([domain, results]) => ({
      domain,
      label: searchDomainLabels[domain],
      results
    }));
}

export function getSearchDomainLabel(domain: SearchDomain): string {
  return searchDomainLabels[domain];
}

export function getSearchDomainOptions(): readonly { readonly value: SearchDomain | "all"; readonly label: string }[] {
  return [
    { value: "all", label: "All domains" },
    ...searchDomainOrder.map((domain) => ({
      value: domain,
      label: searchDomainLabels[domain]
    }))
  ];
}
