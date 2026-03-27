import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  getNavigationBreadcrumbs,
  getNavigationGroups,
  getNavigationRoute,
  mapDataDomainToRouteId,
  workspacePanels
} from "../../../packages/ui/dist/index.js";
import { Breadcrumbs } from "./components/navigation/Breadcrumbs.js";
import { ContextNavigation } from "./components/navigation/ContextNavigation.js";
import { SidebarNavigation } from "./components/navigation/SidebarNavigation.js";
import { GlobalSearch } from "./components/search/GlobalSearch.js";
import { RackElevation } from "./components/rack/RackElevation.js";
import { TopologyGraph } from "./components/topology/TopologyGraph.js";
import { IpamTree } from "./components/ipam-tree/IpamTree.js";
import { useDomainOverview } from "./hooks/use-domain-overview.js";
import { useGlobalSearch } from "./hooks/use-global-search.js";
import { useIpamTree } from "./hooks/use-ipam-tree.js";
import { useRackElevation } from "./hooks/use-rack-elevation.js";
import { useTopologyGraph } from "./hooks/use-topology-graph.js";
import { AppShell } from "./layout/AppShell.js";
import type { UiSearchResult } from "./services/search/global-search.js";

function getSectionFromHash(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const knownIds = new Set([
    "overview",
    "core",
    "ipam",
    "dcim",
    "networking",
    "virtualization",
    "automation"
  ]);

  return knownIds.has(hash) ? hash : "overview";
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
  const search = useGlobalSearch();
  const ipamTree = useIpamTree();
  const rack = useRackElevation();
  const topology = useTopologyGraph();

  useEffect(() => {
    const onHashChange = () => {
      startTransition(() => {
        setActiveSection(getSectionFromHash());
      });
    };

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigationGroups = useMemo(() => getNavigationGroups(), []);
  const activeRoute = useMemo(() => getNavigationRoute(deferredSection), [deferredSection]);
  const breadcrumbs = useMemo(() => getNavigationBreadcrumbs(deferredSection), [deferredSection]);
  const activeDomain = useMemo(
    () =>
      data?.domains.find((domain) => domain.id === activeRoute.dataDomainId) ??
      (activeRoute.id === "overview" ? data?.domains[0] ?? null : null),
    [activeRoute, data]
  );
  const domainPanels = useMemo(() => {
    return navigationGroups
      .flatMap((group) => group.routes)
      .filter((route) => route.id !== "overview")
      .map((route) => {
        const domain = data?.domains.find((item) => item.id === route.dataDomainId);

        if (domain) {
          return {
            id: route.id,
            title: route.label,
            statusLabel: domain.statusLabel,
            tone: domain.tone,
            summary: domain.summary,
            metrics: domain.metrics,
            indicators: domain.indicators
          };
        }

        return {
          id: route.id,
          title: route.label,
          statusLabel: route.id === "virtualization" ? "Reserved" : "Planned",
          tone: "planned" as const,
          summary: route.summary,
          metrics: [
            { label: "State", value: route.id === "virtualization" ? "Reserved" : "Planned" },
            { label: "Mode", value: "Navigation-ready" },
            { label: "Source", value: "Shell model" }
          ],
          indicators: route.contextLinks.map((link) => link.label)
        };
      });
  }, [data, navigationGroups]);
  const activePanel = useMemo(
    () => domainPanels.find((panel) => panel.id === activeRoute.id) ?? domainPanels[0] ?? null,
    [activeRoute.id, domainPanels]
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
    activeRoute.id === "dcim" && rack.status !== "error" && rack.data !== null;
  const showIpamStage =
    activeRoute.id === "ipam" && ipamTree.status !== "error" && ipamTree.data !== null;
  const showTopologyStage =
    activeRoute.id === "networking" && topology.status !== "error" && topology.data !== null;

  const handleSearchResultSelect = (result: UiSearchResult) => {
    search.selectResult(result.id);
    const routeId = mapDataDomainToRouteId(result.domain);

    startTransition(() => {
      setActiveSection(routeId);
    });
    window.location.hash = routeId;
  };

  return (
    <AppShell
      brand={
        <>
          <div className="shell__brand">
            <span className="shell__brand-mark" />
            <div>
              <p>InfraLynx</p>
              <span>Enterprise infrastructure control plane</span>
            </div>
          </div>

          <div className="shell__rail-footer">
            <p>Workspace state</p>
            <strong>{status === "ready" ? "Live domain summary connected" : "Waiting for backend data"}</strong>
          </div>
        </>
      }
      sidebar={<SidebarNavigation groups={navigationGroups} activeRouteId={activeRoute.id} />}
      topbar={
        <header className="shell__topbar">
          <div className="shell__topbar-main">
            <Breadcrumbs items={breadcrumbs} />
            <div className="shell__topbar-heading">
              <p className="shell__eyebrow">Navigation refinement</p>
              <h1>{data?.workspaceName ?? "InfraLynx Platform"}</h1>
            </div>
          </div>

          <div className="shell__topbar-side">
            <div className="shell__header-meta">
              <span>Last synced</span>
              <strong>{formatSyncTime(data?.syncedAt ?? null)}</strong>
            </div>

            <div className="shell__topbar-actions">
              {activeRoute.actions.map((action) => (
                <a key={action.id} href={action.href} className="shell__action-pill">
                  {action.label}
                </a>
              ))}
            </div>
          </div>
        </header>
      }
      content={
        <>
          <div id="section-search">
            <GlobalSearch
              status={search.status}
              query={search.query}
              selectedDomain={search.selectedDomain}
              data={search.data}
              errorMessage={search.errorMessage}
              selectedResultId={search.selectedResultId}
              onQueryChange={search.updateQuery}
              onDomainChange={search.updateDomain}
              onResultSelect={handleSearchResultSelect}
              onRetry={search.retry}
            />
          </div>

          <section className="shell__hero" id="section-brief">
          <div className="shell__hero-copy">
            <p className="shell__eyebrow">{activeRoute.label}</p>
            <h2>
              {status === "loading" && "Synchronizing backend domain summaries."}
              {status === "error" && "Domain data is temporarily unavailable."}
              {status === "ready" && activeRoute.label}
              {status === "idle" && "Preparing the InfraLynx workspace."}
            </h2>
            <p>
              {status === "ready" && (activeDomain?.summary ?? activeRoute.summary)}
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
              <article
                key={panel.id}
                className={`shell__panel shell__panel--${panel.tone} ${
                  panel.id === activeRoute.id ? "shell__panel--active" : ""
                }`}
              >
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
            <span>Domain</span>
            <strong>{activeRoute.domainLabel}</strong>
          </div>
          <div>
            <span>Hierarchy</span>
            <strong>{breadcrumbs.map((item) => item.label).join(" / ")}</strong>
          </div>
          <div>
            <span>Layout state</span>
            <strong>{activePanel?.statusLabel ?? (status === "ready" ? "Stable" : "Loading")}</strong>
          </div>
          </section>

          <section className="shell__workspace-detail" id="section-workspace">
          {ipamTree.status === "loading" && activeRoute.id === "ipam" ? (
            <div className="shell__callout">
              <strong>Loading IPAM hierarchy</strong>
              <span>Precomputing VRF groups, prefix nesting, and utilization before rendering the tree.</span>
              <div className="shell__loading-bar" aria-hidden="true" />
            </div>
          ) : null}

          {ipamTree.status === "error" && activeRoute.id === "ipam" ? (
            <div className="shell__callout shell__callout--error">
              <strong>IPAM hierarchy unavailable</strong>
              <span>{ipamTree.errorMessage}</span>
              <button type="button" className="shell__button" onClick={ipamTree.retry}>
                Retry IPAM fetch
              </button>
            </div>
          ) : null}

          {showIpamStage ? (
            <IpamTree
              rows={ipamTree.data.rows}
              selectedNodeId={ipamTree.selectedNodeId}
              syncedAt={ipamTree.data.syncedAt}
              onSelectNode={ipamTree.selectNode}
              onToggleNode={ipamTree.toggleNode}
            />
          ) : null}

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

          {topology.status === "loading" && activeRoute.id === "networking" ? (
            <div className="shell__callout">
              <strong>Loading topology graph</strong>
              <span>Assembling the filtered graph model, node layout, and interactive viewport state.</span>
              <div className="shell__loading-bar" aria-hidden="true" />
            </div>
          ) : null}

          {topology.status === "error" && activeRoute.id === "networking" ? (
            <div className="shell__callout shell__callout--error">
              <strong>Topology visualization unavailable</strong>
              <span>{topology.errorMessage}</span>
              <button type="button" className="shell__button" onClick={topology.retry}>
                Retry topology fetch
              </button>
            </div>
          ) : null}

          {showTopologyStage ? (
            <TopologyGraph
              graph={topology.data.graph}
              selectedNodeId={topology.selectedNodeId}
              filter={topology.filter}
              filterOptions={topology.data.options}
              viewport={topology.viewport}
              syncedAt={topology.data.syncedAt}
              onSelectNode={topology.selectNode}
              onFilterChange={topology.updateFilter}
              onViewportChange={topology.updateViewport}
              onZoomIn={topology.zoomIn}
              onZoomOut={topology.zoomOut}
              onResetViewport={topology.resetViewport}
            />
          ) : null}
          {!showIpamStage && !showRackStage && !showTopologyStage ? (
            <section className="shell__placeholder-stage">
              <div className="shell__placeholder-copy">
                <p className="shell__eyebrow">{activeRoute.domainLabel}</p>
                <h3>{activeRoute.label}</h3>
                <p>{activeRoute.summary}</p>
              </div>

              <div className="shell__placeholder-grid">
                {activeRoute.contextLinks.map((link) => (
                  <a key={link.id} href={link.href} className="shell__placeholder-link">
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          </section>
        </>
      }
      context={
        <>
        <div id="section-context">
          <ContextNavigation
            route={activeRoute}
            actions={activeRoute.actions}
            contextLinks={activeRoute.contextLinks}
          />
        </div>
        <section className="shell__context-block">
          <p className="shell__eyebrow">Current focus</p>
          <h3>{activeRoute.label}</h3>
          <p>
            {status === "ready"
              ? activeDomain?.summary ?? activeRoute.summary
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
            {(showIpamStage ? ipamTree.data?.guidance ?? [] : []).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
            {(showTopologyStage ? topology.data?.guidance ?? [] : []).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
            {(search.status === "ready" ? search.data?.guidance ?? [] : []).map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
        </>
      }
    />
  );
}
