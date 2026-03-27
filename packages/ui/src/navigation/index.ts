export type NavigationGroupId = "platform" | "domains" | "services";

export type NavigationRouteId =
  | "overview"
  | "core"
  | "ipam"
  | "dcim"
  | "networking"
  | "virtualization"
  | "automation";

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
  readonly domainLabel: string;
  readonly group: NavigationGroupId;
  readonly accent: string;
  readonly summary: string;
  readonly hierarchy: readonly string[];
  readonly dataDomainId: string | null;
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
  readonly domain: string;
  readonly accent: string;
}

const navigationGroupLabels: Record<NavigationGroupId, string> = {
  platform: "Platform",
  domains: "Domains",
  services: "Services"
};

export const navigationRoutes: readonly NavigationRoute[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    domainLabel: "Program",
    group: "platform",
    accent: "var(--ui-accent)",
    summary: "Program-wide snapshot spanning control plane, data models, and visual surfaces.",
    hierarchy: ["Workspace", "Overview"],
    dataDomainId: "overview",
    actions: [
      { id: "overview-search", label: "Search", href: "#section-search" },
      { id: "overview-brief", label: "Domain brief", href: "#section-brief" }
    ],
    contextLinks: [
      { id: "overview-summary", label: "Program summary", href: "#section-brief" },
      { id: "overview-surface", label: "Workspace surface", href: "#section-workspace" }
    ]
  },
  {
    id: "core",
    label: "Core Platform",
    shortLabel: "Core",
    domainLabel: "Core",
    group: "domains",
    accent: "var(--ui-accent-cool)",
    summary: "Authentication, RBAC, tenancy, status, and audit contracts that frame every domain.",
    hierarchy: ["Domains", "Core Platform"],
    dataDomainId: "core",
    actions: [
      { id: "core-summary", label: "Control plane", href: "#section-brief" },
      { id: "core-notes", label: "Policies", href: "#section-context" }
    ],
    contextLinks: [
      { id: "core-brief", label: "Core summary", href: "#section-brief" },
      { id: "core-notes", label: "Policy notes", href: "#section-context" }
    ]
  },
  {
    id: "ipam",
    label: "IPAM",
    shortLabel: "IPAM",
    domainLabel: "IPAM",
    group: "domains",
    accent: "var(--ui-accent)",
    summary: "VRFs, prefixes, VLANs, utilization, and allocation hierarchy views.",
    hierarchy: ["Domains", "IPAM"],
    dataDomainId: "ipam",
    actions: [
      { id: "ipam-search", label: "Search", href: "#section-search" },
      { id: "ipam-tree", label: "Hierarchy", href: "#section-workspace" },
      { id: "ipam-context", label: "Utilization", href: "#section-context" }
    ],
    contextLinks: [
      { id: "ipam-brief", label: "Hierarchy summary", href: "#section-brief" },
      { id: "ipam-tree-link", label: "Prefix tree", href: "#section-workspace" },
      { id: "ipam-guidance", label: "Validation notes", href: "#section-context" }
    ]
  },
  {
    id: "dcim",
    label: "DCIM",
    shortLabel: "DCIM",
    domainLabel: "DCIM",
    group: "domains",
    accent: "var(--ui-accent-signal)",
    summary: "Physical inventory, rack elevation, port inspection, and cable awareness.",
    hierarchy: ["Domains", "DCIM"],
    dataDomainId: "dcim",
    actions: [
      { id: "dcim-search", label: "Search", href: "#section-search" },
      { id: "dcim-rack", label: "Rack view", href: "#section-workspace" },
      { id: "dcim-context", label: "Selections", href: "#section-context" }
    ],
    contextLinks: [
      { id: "dcim-brief", label: "Physical summary", href: "#section-brief" },
      { id: "dcim-rack-link", label: "Elevation", href: "#section-workspace" },
      { id: "dcim-detail", label: "Selected device", href: "#section-context" }
    ]
  },
  {
    id: "networking",
    label: "Networking",
    shortLabel: "Network",
    domainLabel: "Networking",
    group: "domains",
    accent: "var(--ui-accent-cool)",
    summary: "Topology graph, cross-domain wiring, and path-oriented operational visibility.",
    hierarchy: ["Domains", "Networking"],
    dataDomainId: "operations",
    actions: [
      { id: "network-search", label: "Search", href: "#section-search" },
      { id: "network-graph", label: "Topology", href: "#section-workspace" },
      { id: "network-context", label: "Selection", href: "#section-context" }
    ],
    contextLinks: [
      { id: "network-brief", label: "Graph summary", href: "#section-brief" },
      { id: "network-graph-link", label: "Graph view", href: "#section-workspace" },
      { id: "network-detail", label: "Node detail", href: "#section-context" }
    ]
  },
  {
    id: "virtualization",
    label: "Virtualization",
    shortLabel: "Virtual",
    domainLabel: "Virtualization",
    group: "domains",
    accent: "var(--ui-accent-signal)",
    summary: "Planned cluster, hypervisor, and VM workflows in a reserved navigation slot.",
    hierarchy: ["Domains", "Virtualization"],
    dataDomainId: null,
    actions: [
      { id: "virtual-plan", label: "Roadmap", href: "#section-brief" },
      { id: "virtual-surface", label: "Reserved space", href: "#section-workspace" }
    ],
    contextLinks: [
      { id: "virtual-summary", label: "Planned scope", href: "#section-brief" },
      { id: "virtual-context", label: "Future context", href: "#section-context" }
    ]
  },
  {
    id: "automation",
    label: "Automation",
    shortLabel: "Automation",
    domainLabel: "Automation",
    group: "services",
    accent: "var(--ui-accent)",
    summary: "Future jobs, imports, exports, and webhook-driven orchestration.",
    hierarchy: ["Services", "Automation"],
    dataDomainId: "automation",
    actions: [
      { id: "automation-search", label: "Search", href: "#section-search" },
      { id: "automation-brief", label: "Planned workflows", href: "#section-brief" }
    ],
    contextLinks: [
      { id: "automation-summary", label: "Workflow scope", href: "#section-brief" },
      { id: "automation-context", label: "Implementation notes", href: "#section-context" }
    ]
  }
] as const;

export function getNavigationRoute(routeId: string): NavigationRoute {
  const match = navigationRoutes.find((route) => route.id === routeId);

  return match ?? navigationRoutes[0];
}

export function getNavigationGroups(): readonly NavigationGroup[] {
  return (["platform", "domains", "services"] as const).map((groupId) => ({
    id: groupId,
    label: navigationGroupLabels[groupId],
    routes: navigationRoutes.filter((route) => route.group === groupId)
  }));
}

export function getNavigationBreadcrumbs(routeId: string): readonly NavigationBreadcrumb[] {
  const route = getNavigationRoute(routeId);

  return route.hierarchy.map((label, index) => ({
    id: `${route.id}-${index}`,
    label
  }));
}

export function mapDataDomainToRouteId(domainId: string): NavigationRouteId {
  if (domainId === "operations") {
    return "networking";
  }

  if (domainId === "automation") {
    return "automation";
  }

  if (domainId === "core" || domainId === "ipam" || domainId === "dcim") {
    return domainId;
  }

  return "overview";
}

export const shellNavigation: readonly NavigationItem[] = navigationRoutes.map((route) => ({
  id: route.id,
  label: route.label,
  domain: route.domainLabel.toLowerCase(),
  accent: route.accent
}));

export function getNavigationItem(sectionId: string): NavigationItem {
  const match = shellNavigation.find((item) => item.id === sectionId);

  return match ?? shellNavigation[0];
}
