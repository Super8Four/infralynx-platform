import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { shellNavigation, getNavigationItem, workspacePanels } from "../../../packages/ui/dist/index.js";
import { RackElevation } from "./components/rack/RackElevation.js";
import { useDomainOverview } from "./hooks/use-domain-overview.js";
import { useRackElevation } from "./hooks/use-rack-elevation.js";

function getSectionFromHash(): string {
  const hash = window.location.hash.replace(/^#/, "");

  return shellNavigation.some((item) => item.id === hash) ? hash : "overview";
}

function formatSyncTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Waiting for API";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function App() {
  const [activeSection, setActiveSection] = useState(() => getSectionFromHash());
  const deferredSection = useDeferredValue(activeSection);
  const { status, data, errorMessage, retry } = useDomainOverview();
  const rack = useRackElevation();

  useEffect(() => {
    const onHashChange = () => {
      startTransition(() => {
        setActiveSection(getSectionFromHash());
      });
    };

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeItem = useMemo(() => getNavigationItem(deferredSection), [deferredSection]);
  const navigation = shellNavigation.map((item) => ({
    ...item,
    active: item.id === activeSection
  }));
  const activeDomain = useMemo(
    () => data?.domains.find((domain) => domain.id === deferredSection) ?? data?.domains[0] ?? null,
    [data, deferredSection]
  );
  const domainPanels = useMemo(
    () => data?.domains.filter((domain) => domain.id !== "overview") ?? [],
    [data]
  );
  const fallbackPanels = workspacePanels.map((panel) => ({
    id: panel.id,
    title: panel.title,
    statusLabel: "Static",
    tone: "planned" as const,
    summary: panel.summary,
    metrics: panel.indicators.slice(0, 3).map((indicator, index) => ({
      label: `Signal ${index + 1}`,
      value: indicator
    })),
    indicators: panel.indicators
  }));
  const visiblePanels = domainPanels.length > 0 ? domainPanels : fallbackPanels;
  const showRackStage =
    deferredSection === "dcim" && rack.status !== "error" && rack.data !== null;

  return (
    <div className="shell">
      <aside className="shell__rail">
        <div className="shell__brand">
          <span className="shell__brand-mark" />
          <div>
            <p>InfraLynx</p>
            <span>Enterprise infrastructure control plane</span>
          </div>
        </div>

        <nav className="shell__nav" aria-label="Primary">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={item.active ? "shell__nav-link shell__nav-link--active" : "shell__nav-link"}
              style={{ "--nav-accent": item.accent } as React.CSSProperties}
            >
              <span>{item.label}</span>
              <small>{item.domain}</small>
            </a>
          ))}
        </nav>

        <div className="shell__rail-footer">
          <p>Workspace state</p>
          <strong>{status === "ready" ? "Live domain summary connected" : "Waiting for backend data"}</strong>
        </div>
      </aside>

      <main className="shell__workspace">
        <header className="shell__header">
          <div>
            <p className="shell__eyebrow">UI data integration layer</p>
            <h1>{data?.workspaceName ?? "InfraLynx Platform"}</h1>
          </div>

          <div className="shell__header-meta">
            <span>Last synced</span>
            <strong>{formatSyncTime(data?.syncedAt ?? null)}</strong>
          </div>
        </header>

        <section className="shell__hero" id={activeItem.id}>
          <div className="shell__hero-copy">
            <p className="shell__eyebrow">{status === "ready" ? activeItem.label : "Data status"}</p>
            <h2>
              {status === "loading" && "Synchronizing backend domain summaries."}
              {status === "error" && "Domain data is temporarily unavailable."}
              {status === "ready" && activeDomain?.title}
              {status === "idle" && "Preparing the InfraLynx workspace."}
            </h2>
            <p>
              {status === "ready" && activeDomain?.summary}
              {status === "loading" &&
                "The shell is requesting normalized domain payloads from the InfraLynx API and preparing workspace-ready view models."}
              {status === "error" && errorMessage}
              {status === "idle" &&
                "The UI keeps navigation stable while the first domain snapshot is assembled."}
            </p>

            {status === "error" ? (
              <div className="shell__callout shell__callout--error">
                <strong>Fetch failed</strong>
                <span>{errorMessage}</span>
                <button type="button" className="shell__button" onClick={retry}>
                  Retry fetch
                </button>
              </div>
            ) : null}

            {status === "loading" ? (
              <div className="shell__callout">
                <strong>Loading domain snapshot</strong>
                <span>Transport, normalization, and state reduction are all in progress.</span>
                <div className="shell__loading-bar" aria-hidden="true" />
              </div>
            ) : null}
          </div>

          <div className="shell__hero-grid" aria-label="Domain overview">
            {visiblePanels.map((panel) => (
              <article key={panel.id} className={`shell__panel shell__panel--${panel.tone}`}>
                <div className="shell__panel-header">
                  <p className="shell__panel-eyebrow">{panel.statusLabel}</p>
                  <span className={`shell__status-badge shell__status-badge--${panel.tone}`}>
                    {panel.statusLabel}
                  </span>
                </div>
                <h3>{panel.title}</h3>
                <p>{panel.summary}</p>
                <div className="shell__metric-grid">
                  {panel.metrics.map((metric) => (
                    <div key={`${panel.id}-${metric.label}`} className="shell__metric">
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </div>
                  ))}
                </div>
                <ul>
                  {panel.indicators.map((indicator) => (
                    <li key={indicator}>{indicator}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="shell__strip">
          <div>
            <span>Data contract</span>
            <strong>{data?.boundary ?? "Normalized UI contract pending"}</strong>
          </div>
          <div>
            <span>Runtime</span>
            <strong>{data?.runtime ?? "Awaiting backend metadata"}</strong>
          </div>
          <div>
            <span>Transport state</span>
            <strong>{status === "ready" ? "Healthy fetch cycle" : status === "error" ? "Retry required" : "Loading"}</strong>
          </div>
        </section>

        <section className="shell__workspace-detail">
          {rack.status === "loading" ? (
            <div className="shell__callout">
              <strong>Loading rack elevation</strong>
              <span>Building the grid, device positions, and cable overlays from the rack API contract.</span>
              <div className="shell__loading-bar" aria-hidden="true" />
            </div>
          ) : null}

          {rack.status === "error" ? (
            <div className="shell__callout shell__callout--error">
              <strong>Rack visualization unavailable</strong>
              <span>{rack.errorMessage}</span>
              <button type="button" className="shell__button" onClick={rack.retry}>
                Retry rack fetch
              </button>
            </div>
          ) : null}

          {showRackStage ? (
            <RackElevation
              rack={rack.data.rack}
              selectedDeviceId={rack.selectedDeviceId}
              selectedPortId={rack.selectedPortId}
              onDeviceSelect={rack.selectDevice}
              onPortSelect={rack.selectPort}
            />
          ) : null}
        </section>
      </main>

      <aside className="shell__context">
        <section className="shell__context-block">
          <p className="shell__eyebrow">Current focus</p>
          <h3>{activeDomain?.title ?? activeItem.label}</h3>
          <p>
            {status === "ready"
              ? activeDomain?.summary
              : "The context rail remains stable while service, hook, and state layers converge on a normalized UI payload."}
          </p>
        </section>

        <section className="shell__context-block">
          <p className="shell__eyebrow">Integration notes</p>
          <ul className="shell__notes">
            {(data?.notices ?? [
              "API requests are isolated in src/services.",
              "State transitions are isolated in src/state.",
              "React hooks own loading and retry orchestration."
            ]).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
            {(showRackStage ? rack.data?.guidance ?? [] : []).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
