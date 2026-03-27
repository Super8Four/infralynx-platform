import type { ChangeEvent } from "react";

import type {
  UiSearchDomain,
  UiSearchFilterOption,
  UiSearchModel,
  UiSearchResult
} from "../../services/search/global-search.js";

export interface GlobalSearchProps {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly query: string;
  readonly selectedDomain: UiSearchDomain | "all";
  readonly data: UiSearchModel | null;
  readonly errorMessage: string | null;
  readonly selectedResultId: string | null;
  readonly onQueryChange: (query: string) => void;
  readonly onDomainChange: (domain: UiSearchDomain | "all") => void;
  readonly onResultSelect: (result: UiSearchResult) => void;
  readonly onRetry: () => void;
}

function renderFilterOption(filter: UiSearchFilterOption) {
  return `${filter.label} (${filter.count})`;
}

export function GlobalSearch({
  status,
  query,
  selectedDomain,
  data,
  errorMessage,
  selectedResultId,
  onQueryChange,
  onDomainChange,
  onResultSelect,
  onRetry
}: GlobalSearchProps) {
  const groups = data?.groups ?? [];
  const hasQuery = query.trim().length > 0;
  const totalResults = data?.totalResults ?? 0;

  return (
    <section className="shell__search" aria-label="Global search">
      <div className="shell__search-bar">
        <label className="shell__search-input">
          <span className="shell__eyebrow">Global search</span>
          <input
            type="search"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
            placeholder="Search tenants, prefixes, devices, topology, VLANs"
            aria-label="Search InfraLynx"
          />
        </label>

        <label className="shell__search-filter">
          <span className="shell__eyebrow">Domain filter</span>
          <select
            value={selectedDomain}
            onChange={(event) => onDomainChange(event.target.value as UiSearchDomain | "all")}
            aria-label="Filter search results by domain"
          >
            {(data?.filters ?? []).map((filter) => (
              <option key={filter.value} value={filter.value}>
                {renderFilterOption(filter)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="shell__search-summary">
        <p className="shell__eyebrow">Search status</p>
        <strong>
          {!hasQuery && "Enter keywords to search across domains"}
          {hasQuery && status === "loading" && "Searching normalized domain records"}
          {hasQuery && status === "error" && "Search request failed"}
          {hasQuery && status === "ready" && `${totalResults} results grouped by domain`}
          {hasQuery && status === "idle" && "Waiting for search input"}
        </strong>
      </div>

      {status === "error" ? (
        <div className="shell__callout shell__callout--error">
          <strong>Search unavailable</strong>
          <span>{errorMessage}</span>
          <button type="button" className="shell__button" onClick={onRetry}>
            Retry search
          </button>
        </div>
      ) : null}

      {status === "loading" && hasQuery ? (
        <div className="shell__callout">
          <strong>Searching domain records</strong>
          <span>InfraLynx is scoring keyword matches and regrouping them by domain.</span>
          <div className="shell__loading-bar" aria-hidden="true" />
        </div>
      ) : null}

      {status === "ready" && hasQuery && totalResults === 0 ? (
        <div className="shell__search-empty">
          <strong>No matches found</strong>
          <p>Try a broader keyword, or switch the domain filter back to all domains.</p>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="shell__search-groups">
          {groups.map((group) => (
            <section key={group.domain} className="shell__search-group" aria-label={group.label}>
              <div className="shell__search-group-header">
                <div>
                  <p className="shell__eyebrow">{group.label}</p>
                  <h3>{group.count} matches</h3>
                </div>
              </div>

              <div className="shell__search-results">
                {group.results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={
                      result.id === selectedResultId
                        ? "shell__search-result shell__search-result--active"
                        : "shell__search-result"
                    }
                    onClick={() => onResultSelect(result)}
                  >
                    <div className="shell__search-result-header">
                      <div>
                        <span className="shell__search-kind">{result.kind}</span>
                        <h4>{result.title}</h4>
                      </div>
                      <span className={`shell__status-badge shell__status-badge--${result.statusTone}`}>
                        {result.statusLabel}
                      </span>
                    </div>
                    <p>{result.summary}</p>
                    <div className="shell__search-meta">
                      <span>{result.location}</span>
                      <span>Score {result.score}</span>
                    </div>
                    <div className="shell__search-tags">
                      {result.matchedTerms.map((term) => (
                        <span key={`${result.id}-${term}`} className="shell__search-tag shell__search-tag--match">
                          {term}
                        </span>
                      ))}
                      {result.tags.slice(0, 3).map((tag) => (
                        <span key={`${result.id}-${tag}`} className="shell__search-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
