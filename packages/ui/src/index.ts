export interface WorkspacePanel {
  readonly id: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly indicators: readonly string[];
}

export const uiTokens = {
  color: {
    background: "#0f1823",
    backgroundElevated: "#172434",
    surface: "#203246",
    surfaceMuted: "#1b2a3b",
    border: "#39506a",
    text: "#f7f7f4",
    textMuted: "#b9c4ce",
    accent: "#d7b26d",
    accentCool: "#6da6d7",
    accentSignal: "#8bd6a7"
  },
  radius: {
    sm: "10px",
    md: "18px",
    lg: "28px"
  },
  shadow: {
    panel: "0 24px 80px rgba(4, 10, 18, 0.45)"
  }
} as const;

export const workspacePanels: readonly WorkspacePanel[] = [
  {
    id: "core",
    title: "Core control plane",
    eyebrow: "Authentication, RBAC, tenancy",
    summary: "Shared identity and policy surfaces stay isolated from domain workloads.",
    indicators: ["8 ADRs accepted", "Core skeleton merged", "Audit contracts active"]
  },
  {
    id: "ipam",
    title: "Address authority",
    eyebrow: "VRFs, prefixes, addresses, VLANs",
    summary: "Allocation policy remains explicit before allocator logic and runtime queries land.",
    indicators: ["VRF-scoped allocations", "CIDR validation in place", "VLAN bounds enforced"]
  },
  {
    id: "dcim",
    title: "Physical inventory graph",
    eyebrow: "Sites, racks, devices, cabling",
    summary: "Rack occupancy and cable topology are modeled as physical truth, not inferred state.",
    indicators: ["Rack face-aware", "Cable endpoint checks", "Device placement bounded"]
  }
] as const;

export * from "./rack-system/index.js";
export * from "./topology/index.js";
export * from "./ipam-tree/index.js";
export * from "./navigation/index.js";
