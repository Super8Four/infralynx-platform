import { useEffect, useState } from "react";

import {
  getNavigationBreadcrumbs,
  getNavigationGroups,
  getNavigationRoute,
  type NavigationRouteId
} from "@infralynx/ui";

import { Breadcrumbs } from "./components/layout/navigation/Breadcrumbs";
import { ContextNavigation } from "./components/layout/navigation/ContextNavigation";
import { SidebarNavigation } from "./components/layout/navigation/SidebarNavigation";
import { AppShell } from "./layout/AppShell";
import { fetchInventoryNavigation, type InventoryNavigationResponse } from "./services/inventory";
import { DevicesPage } from "./pages/dcim/DevicesPage";
import { RacksPage } from "./pages/dcim/RacksPage";
import { SitesPage } from "./pages/dcim/SitesPage";
import { TenantsPage } from "./pages/core/TenantsPage";
import { UsersPage } from "./pages/core/UsersPage";
import { IpAddressesPage } from "./pages/ipam/IpAddressesPage";
import { PrefixesPage } from "./pages/ipam/PrefixesPage";
import { VrfsPage } from "./pages/ipam/VrfsPage";
import { ConnectionsPage } from "./pages/network/ConnectionsPage";
import { InterfacesPage } from "./pages/network/InterfacesPage";
import { JobsPage } from "./pages/operations/JobsPage";

interface AppRoute {
  readonly routeId: NavigationRouteId;
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
}

function parseRoute(hash: string): AppRoute {
  const cleaned = hash.replace(/^#\/?/, "");
  const segments = cleaned.length === 0 ? [] : cleaned.split("/").filter(Boolean);
  const routeId = (segments[0] ?? "devices") as NavigationRouteId;
  const validRouteIds: readonly NavigationRouteId[] = [
    "tenants",
    "users",
    "sites",
    "racks",
    "devices",
    "vrfs",
    "prefixes",
    "ip-addresses",
    "interfaces",
    "connections",
    "jobs"
  ];

  if (!validRouteIds.includes(routeId)) {
    return { routeId: "devices", mode: "list", recordId: null };
  }

  if (segments[1] === "new") {
    return { routeId, mode: "new", recordId: null };
  }

  if (segments[1] && segments[2] === "edit") {
    return { routeId, mode: "edit", recordId: segments[1] };
  }

  if (segments[1]) {
    return { routeId, mode: "detail", recordId: segments[1] };
  }

  return { routeId, mode: "list", recordId: null };
}

function getTopbarActions(route: AppRoute) {
  if (
    (route.routeId === "sites" ||
      route.routeId === "racks" ||
      route.routeId === "devices" ||
      route.routeId === "prefixes" ||
      route.routeId === "ip-addresses") &&
    route.mode === "list"
  ) {
    return [{ label: `Create ${getNavigationRoute(route.routeId).shortLabel}`, href: `#/${route.routeId}/new` }];
  }

  if (route.mode === "detail" && route.recordId) {
    return [{ label: "Edit", href: `#/${route.routeId}/${route.recordId}/edit` }];
  }

  if (route.mode === "new" || route.mode === "edit") {
    return [{ label: "Back", href: route.recordId ? `#/${route.routeId}/${route.recordId}` : `#/${route.routeId}` }];
  }

  return [];
}

function renderPage(route: AppRoute) {
  switch (route.routeId) {
    case "tenants":
      return <TenantsPage />;
    case "users":
      return <UsersPage />;
    case "sites":
      return <SitesPage mode={route.mode} recordId={route.recordId} />;
    case "racks":
      return <RacksPage mode={route.mode} recordId={route.recordId} />;
    case "devices":
      return <DevicesPage mode={route.mode} recordId={route.recordId} />;
    case "vrfs":
      return <VrfsPage />;
    case "prefixes":
      return <PrefixesPage mode={route.mode} recordId={route.recordId} />;
    case "ip-addresses":
      return <IpAddressesPage mode={route.mode} recordId={route.recordId} />;
    case "interfaces":
      return <InterfacesPage />;
    case "connections":
      return <ConnectionsPage />;
    case "jobs":
      return <JobsPage />;
  }
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.hash));
  const [navigationSummary, setNavigationSummary] = useState<InventoryNavigationResponse | null>(null);

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseRoute(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    void fetchInventoryNavigation().then(setNavigationSummary);
  }, []);

  const activeRoute = getNavigationRoute(route.routeId);
  const breadcrumbs = getNavigationBreadcrumbs(route.routeId);
  const groups = getNavigationGroups();
  const countsByRoute = Object.fromEntries(
    Object.values(navigationSummary?.sections ?? {})
      .flat()
      .map((entry) => [entry.id, entry.count])
  );
  const topbarActions = getTopbarActions(route);

  return (
    <AppShell
      brand={
        <div className="brand-panel">
          <p className="brand-panel__eyebrow">InfraLynx</p>
          <h1>Platform Workspace</h1>
          <p>Phase 1 navigation exposes only the resources already supported by the platform.</p>
        </div>
      }
      sidebar={
        <SidebarNavigation
          groups={groups}
          activeRouteId={route.routeId}
          activeResourceCountByRoute={countsByRoute}
        />
      }
      topbar={
        <div className="topbar-shell">
          <div>
            <Breadcrumbs items={breadcrumbs} />
            <div className="topbar-shell__heading">
              <h2>{activeRoute.label}</h2>
              <p>{activeRoute.summary}</p>
            </div>
          </div>
          <div className="topbar-shell__actions">
            {topbarActions.map((action) => (
              <a key={action.href} href={action.href} className="topbar-shell__action">
                {action.label}
              </a>
            ))}
          </div>
        </div>
      }
      content={<div className="workspace-scroll">{renderPage(route)}</div>}
      context={
        <ContextNavigation
          title={activeRoute.label}
          summary={activeRoute.summary}
          links={activeRoute.contextLinks}
        />
      }
    />
  );
}
