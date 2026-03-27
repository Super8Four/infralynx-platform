export type NavigationGroupId = "core" | "dcim" | "ipam" | "network" | "operations";

export type NavigationRouteId =
  | "tenants"
  | "users"
  | "sites"
  | "racks"
  | "devices"
  | "vrfs"
  | "prefixes"
  | "ip-addresses"
  | "interfaces"
  | "connections"
  | "jobs";

export interface NavigationAction {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface NavigationContextLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface NavigationRoute {
  readonly id: NavigationRouteId;
  readonly label: string;
  readonly shortLabel: string;
  readonly group: NavigationGroupId;
  readonly accent: string;
  readonly summary: string;
  readonly hierarchy: readonly string[];
  readonly writable: boolean;
  readonly actions: readonly NavigationAction[];
  readonly contextLinks: readonly NavigationContextLink[];
}

export interface NavigationGroup {
  readonly id: NavigationGroupId;
  readonly label: string;
  readonly routes: readonly NavigationRoute[];
}

export interface NavigationBreadcrumb {
  readonly id: string;
  readonly label: string;
}

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly accent: string;
}

const navigationGroupLabels: Record<NavigationGroupId, string> = {
  core: "Core",
  dcim: "DCIM",
  ipam: "IPAM",
  network: "Network",
  operations: "Operations"
};

export const navigationRoutes: readonly NavigationRoute[] = [
  {
    id: "tenants",
    label: "Tenants",
    shortLabel: "Tenants",
    group: "core",
    accent: "var(--ui-accent-cool)",
    summary: "Tenant boundaries and ownership context.",
    hierarchy: ["Core", "Tenants"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "core-tenants", label: "Tenant directory", href: "#/tenants" }]
  },
  {
    id: "users",
    label: "Users",
    shortLabel: "Users",
    group: "core",
    accent: "var(--ui-accent-cool)",
    summary: "Current platform identities and assigned roles.",
    hierarchy: ["Core", "Users"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "core-users", label: "User directory", href: "#/users" }]
  },
  {
    id: "sites",
    label: "Sites",
    shortLabel: "Sites",
    group: "dcim",
    accent: "var(--ui-accent-signal)",
    summary: "Physical sites and top-level location boundaries.",
    hierarchy: ["DCIM", "Sites"],
    writable: true,
    actions: [{ id: "site-create", label: "Create site", href: "#/sites/new" }],
    contextLinks: [{ id: "site-list", label: "Site list", href: "#/sites" }]
  },
  {
    id: "racks",
    label: "Racks",
    shortLabel: "Racks",
    group: "dcim",
    accent: "var(--ui-accent-signal)",
    summary: "Rack inventory with capacity and placement context.",
    hierarchy: ["DCIM", "Racks"],
    writable: true,
    actions: [{ id: "rack-create", label: "Create rack", href: "#/racks/new" }],
    contextLinks: [{ id: "rack-list", label: "Rack list", href: "#/racks" }]
  },
  {
    id: "devices",
    label: "Devices",
    shortLabel: "Devices",
    group: "dcim",
    accent: "var(--ui-accent-signal)",
    summary: "Device inventory with interface and cable relationships.",
    hierarchy: ["DCIM", "Devices"],
    writable: true,
    actions: [{ id: "device-create", label: "Create device", href: "#/devices/new" }],
    contextLinks: [{ id: "device-list", label: "Device list", href: "#/devices" }]
  },
  {
    id: "vrfs",
    label: "VRFs",
    shortLabel: "VRFs",
    group: "ipam",
    accent: "var(--ui-accent)",
    summary: "Routing scopes used by prefixes and IP allocations.",
    hierarchy: ["IPAM", "VRFs"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "vrf-list", label: "VRF list", href: "#/vrfs" }]
  },
  {
    id: "prefixes",
    label: "Prefixes",
    shortLabel: "Prefixes",
    group: "ipam",
    accent: "var(--ui-accent)",
    summary: "Hierarchical prefix inventory with utilization context.",
    hierarchy: ["IPAM", "Prefixes"],
    writable: true,
    actions: [{ id: "prefix-create", label: "Create prefix", href: "#/prefixes/new" }],
    contextLinks: [{ id: "prefix-list", label: "Prefix list", href: "#/prefixes" }]
  },
  {
    id: "ip-addresses",
    label: "IP Addresses",
    shortLabel: "IP Addresses",
    group: "ipam",
    accent: "var(--ui-accent)",
    summary: "Address allocations bound to prefixes and interfaces.",
    hierarchy: ["IPAM", "IP Addresses"],
    writable: true,
    actions: [{ id: "ip-create", label: "Create IP address", href: "#/ip-addresses/new" }],
    contextLinks: [{ id: "ip-list", label: "Address list", href: "#/ip-addresses" }]
  },
  {
    id: "interfaces",
    label: "Interfaces",
    shortLabel: "Interfaces",
    group: "network",
    accent: "var(--ui-accent-cool)",
    summary: "Read-only interface view for cross-domain relationships.",
    hierarchy: ["Network", "Interfaces"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "interface-list", label: "Interface list", href: "#/interfaces" }]
  },
  {
    id: "connections",
    label: "Connections",
    shortLabel: "Connections",
    group: "network",
    accent: "var(--ui-accent-cool)",
    summary: "Physical and logical connection records.",
    hierarchy: ["Network", "Connections"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "connection-list", label: "Connection list", href: "#/connections" }]
  },
  {
    id: "jobs",
    label: "Jobs",
    shortLabel: "Jobs",
    group: "operations",
    accent: "var(--ui-accent-signal)",
    summary: "Background job lifecycle, results, and logs.",
    hierarchy: ["Operations", "Jobs"],
    writable: false,
    actions: [],
    contextLinks: [{ id: "jobs-list", label: "Job queue", href: "#/jobs" }]
  }
] as const;

export function getNavigationRoute(routeId: string): NavigationRoute {
  return navigationRoutes.find((route) => route.id === routeId) ?? navigationRoutes[0];
}

export function getNavigationGroups(): readonly NavigationGroup[] {
  return (["core", "dcim", "ipam", "network", "operations"] as const).map((groupId) => ({
    id: groupId,
    label: navigationGroupLabels[groupId],
    routes: navigationRoutes.filter((route) => route.group === groupId)
  }));
}

export function getNavigationBreadcrumbs(routeId: string): readonly NavigationBreadcrumb[] {
  const route = getNavigationRoute(routeId);
  return route.hierarchy.map((label, index) => ({ id: `${route.id}-${index}`, label }));
}

export function isWritableNavigationRoute(routeId: string): boolean {
  return getNavigationRoute(routeId).writable;
}

export const shellNavigation: readonly NavigationItem[] = navigationRoutes.map((route) => ({
  id: route.id,
  label: route.label,
  group: route.group,
  accent: route.accent
}));

export function getNavigationItem(sectionId: string): NavigationItem {
  return shellNavigation.find((item) => item.id === sectionId) ?? shellNavigation[0];
}
