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
import { AuthProvidersPage } from "./pages/admin/auth/AuthProvidersPage";
import { fetchInventoryNavigation, type InventoryNavigationResponse } from "./services/inventory";
import { LoginPage } from "./components/auth/LoginPage";
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
import {
  fetchCurrentAuthSession,
  readLoginResultFromHash
} from "./services/auth";

interface AppRoute {
  readonly routeId: NavigationRouteId | "login";
  readonly mode: "list" | "new" | "detail" | "edit";
  readonly recordId: string | null;
  readonly errorMessage: string | null;
}

function parseRoute(hash: string): AppRoute {
  const cleaned = hash.replace(/^#\/?/, "");
  const loginSuccess = readLoginResultFromHash(hash);

  if (loginSuccess) {
    window.localStorage.setItem("infralynx.auth.session", JSON.stringify(loginSuccess));
    window.location.hash = "#/auth-providers";
    return { routeId: "login", mode: "list", recordId: null, errorMessage: null };
  }

  if (cleaned.startsWith("login")) {
    const query = cleaned.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    return {
      routeId: "login",
      mode: "list",
      recordId: null,
      errorMessage: params.get("error")
    };
  }

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
    "jobs",
    "auth-providers"
  ];

  if (!validRouteIds.includes(routeId)) {
    return { routeId: "devices", mode: "list", recordId: null, errorMessage: null };
  }

  if (segments[1] === "new") {
    return { routeId, mode: "new", recordId: null, errorMessage: null };
  }

  if (segments[1] && segments[2] === "edit") {
    return { routeId, mode: "edit", recordId: segments[1], errorMessage: null };
  }

  if (segments[1]) {
    return { routeId, mode: "detail", recordId: segments[1], errorMessage: null };
  }

  return { routeId, mode: "list", recordId: null, errorMessage: null };
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

  if (route.routeId === "auth-providers" && route.mode === "list") {
    return [{ label: "Add Provider", href: "#/auth-providers/new" }];
  }

  if (route.mode === "new" || route.mode === "edit") {
    return [{ label: "Back", href: route.recordId ? `#/${route.routeId}/${route.recordId}` : `#/${route.routeId}` }];
  }

  return [];
}

function renderPage(route: AppRoute) {
  if (route.routeId === "login") {
    return <LoginPage errorMessage={route.errorMessage} onAuthenticated={() => (window.location.hash = "#/auth-providers")} />;
  }

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
    case "auth-providers":
      return <AuthProvidersPage mode={route.mode} recordId={route.recordId} />;
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

  useEffect(() => {
    void fetchCurrentAuthSession().catch(() => undefined);
  }, []);

  if (route.routeId === "login") {
    return renderPage(route);
  }

  const activeRoute = getNavigationRoute(route.routeId as NavigationRouteId);
  const breadcrumbs = getNavigationBreadcrumbs(route.routeId as NavigationRouteId);
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
