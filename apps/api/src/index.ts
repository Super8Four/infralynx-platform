import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import {
  createSearchQuery,
  getSearchDomainLabel,
  getSearchDomainOptions,
  groupSearchResults,
  searchRecords,
  defaultCorePermissions,
  defaultCoreRoles,
  defaultTenantStatuses,
  type SearchDomain,
  type SearchRecord,
  type Tenant
} from "../../../packages/core-domain/dist/index.js";
import { type Rack, type Site, validateCable, validateRackPosition } from "../../../packages/dcim-domain/dist/index.js";
import { platformBoundaries } from "../../../packages/domain-core/dist/index.js";
import {
  buildPrefixHierarchy,
  createPrefixUtilizationDirectory,
  type IpAddress,
  type Prefix,
  type Vlan,
  type Vrf,
  validateIpAddress,
  validatePrefix,
  validatePrefixHierarchy
} from "../../../packages/ipam-domain/dist/index.js";
import {
  createTopologyView,
  tracePath,
  validateInterfaceIpBinding,
  validateInterfaceVlanBinding,
  validateTopologyEdge
} from "../../../packages/network-domain/dist/index.js";
import { handleExportApiRequest } from "./export/index.js";
import { handleImportApiRequest } from "./import/index.js";
import { handleInventoryApiRequest } from "./inventory/index.js";
import { handleJobsApiRequest } from "./jobs/index.js";
import { handleMediaApiRequest } from "./media/index.js";

export interface ApiMetricResponse {
  readonly label: string;
  readonly value: string;
}

export interface ApiDomainResponse {
  readonly id: string;
  readonly title: string;
  readonly status: "ready" | "attention" | "planned";
  readonly summary: string;
  readonly metrics: readonly ApiMetricResponse[];
  readonly indicators: readonly string[];
}

export interface ApiOverviewResponse {
  readonly generatedAt: string;
  readonly workspace: {
    readonly name: string;
    readonly runtime: string;
    readonly boundary: string;
  };
  readonly domains: readonly ApiDomainResponse[];
  readonly notices: readonly string[];
}

export interface ApiRackPortResponse {
  readonly id: string;
  readonly label: string;
  readonly side: "left" | "right";
  readonly status: "connected" | "available" | "disabled";
  readonly cableId: string | null;
  readonly peerPortLabel: string | null;
}

export interface ApiRackDeviceResponse {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tone: "network" | "compute" | "power" | "storage";
  readonly startUnit: number;
  readonly heightUnits: number;
  readonly ports: readonly ApiRackPortResponse[];
}

export interface ApiRackCableResponse {
  readonly id: string;
  readonly fromDeviceId: string;
  readonly fromPortId: string;
  readonly fromPortLabel: string;
  readonly toDeviceId: string;
  readonly toPortId: string;
  readonly toPortLabel: string;
}

export interface ApiRackResponse {
  readonly generatedAt: string;
  readonly rack: {
    readonly id: string;
    readonly name: string;
    readonly siteName: string;
    readonly totalUnits: number;
    readonly devices: readonly ApiRackDeviceResponse[];
    readonly cables: readonly ApiRackCableResponse[];
  };
  readonly guidance: readonly string[];
}

export interface ApiTopologyResponse {
  readonly generatedAt: string;
  readonly graph: ReturnType<typeof createTopologyView>;
  readonly guidance: readonly string[];
}

type ApiIpamUtilizationEntry =
  ReturnType<typeof createPrefixUtilizationDirectory> extends ReadonlyMap<string, infer TValue>
    ? TValue
    : never;

export interface ApiIpamTreeResponse {
  readonly generatedAt: string;
  readonly vrfs: readonly Vrf[];
  readonly prefixes: readonly Prefix[];
  readonly ipAddresses: readonly Pick<IpAddress, "prefixId">[];
  readonly hierarchy: ReturnType<typeof buildPrefixHierarchy>;
  readonly utilization: readonly ApiIpamUtilizationEntry[];
  readonly guidance: readonly string[];
}

export interface ApiSearchFilterOptionResponse {
  readonly value: SearchDomain | "all";
  readonly label: string;
  readonly count: number;
}

export interface ApiSearchResultResponse {
  readonly id: string;
  readonly domain: SearchDomain;
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
  readonly domain: SearchDomain;
  readonly label: string;
  readonly results: readonly ApiSearchResultResponse[];
}

export interface ApiSearchResponse {
  readonly generatedAt: string;
  readonly query: string;
  readonly selectedDomain: SearchDomain | "all";
  readonly totalResults: number;
  readonly availableDomains: readonly ApiSearchFilterOptionResponse[];
  readonly groups: readonly ApiSearchResultGroupResponse[];
  readonly guidance: readonly string[];
}

const referenceTenants: readonly Tenant[] = [
  { id: "tenant-ops", slug: "operations", name: "Operations", status: "active" },
  { id: "tenant-net", slug: "network-engineering", name: "Network Engineering", status: "active" }
] as const;

const referencePrefixes: readonly Prefix[] = [
  {
    id: "prefix-root",
    vrfId: "vrf-global",
    parentPrefixId: null,
    cidr: "10.40.0.0/16",
    family: 4,
    status: "active",
    allocationMode: "hierarchical",
    tenantId: "tenant-net",
    vlanId: null
  },
  {
    id: "prefix-leaf",
    vrfId: "vrf-global",
    parentPrefixId: "prefix-root",
    cidr: "10.40.12.0/24",
    family: 4,
    status: "active",
    allocationMode: "pool",
    tenantId: "tenant-net",
    vlanId: "vlan-120"
  }
] as const;

const referenceVrfs: readonly Vrf[] = [
  { id: "vrf-global", name: "Global Services", rd: "65000:10", tenantId: "tenant-net" },
  { id: "vrf-campus", name: "Campus Access", rd: "65000:20", tenantId: "tenant-ops" }
] as const;

const referenceAddresses: readonly IpAddress[] = [
  {
    id: "ip-leaf-sw1",
    vrfId: "vrf-global",
    address: "10.40.12.10/24",
    family: 4,
    status: "active",
    role: "primary",
    prefixId: "prefix-leaf",
    interfaceId: "interface-leaf-sw1"
  },
  {
    id: "ip-leaf-sw2",
    vrfId: "vrf-global",
    address: "10.40.12.11/24",
    family: 4,
    status: "active",
    role: "primary",
    prefixId: "prefix-leaf",
    interfaceId: "interface-leaf-sw2"
  }
] as const;

const referenceVlans: readonly Vlan[] = [
  {
    id: "vlan-120",
    vlanId: 120,
    name: "Production Leaf",
    status: "active",
    tenantId: "tenant-net",
    interfaceIds: ["interface-leaf-sw1", "interface-leaf-sw2"]
  }
] as const;

const referenceSites: readonly Site[] = [
  { id: "site-dal1", slug: "dal1", name: "Dallas One", tenantId: "tenant-ops" }
] as const;

const referenceRacks: readonly Rack[] = [
  { id: "rack-a1", siteId: "site-dal1", name: "A1", totalUnits: 42 },
  { id: "rack-a2", siteId: "site-dal1", name: "A2", totalUnits: 42 }
] as const;

function createSearchRecords(): readonly SearchRecord[] {
  const rackResponse = createRackResponse();
  const topologyResponse = createTopologyResponse();

  return [
    ...referenceTenants.map((tenant) => ({
      id: tenant.id,
      domain: "core" as const,
      kind: "tenant",
      title: tenant.name,
      summary: `${tenant.name} tenant boundary with ${tenant.status} lifecycle state.`,
      location: `Core / Tenants / ${tenant.slug}`,
      keywords: [tenant.slug, tenant.status, "tenant"],
      tags: ["core", "tenancy"],
      status: tenant.status
    })),
    ...defaultCoreRoles.map((role) => ({
      id: role.id,
      domain: "core" as const,
      kind: "role",
      title: role.name,
      summary: `${role.permissionIds.length} permissions assigned to ${role.slug}.`,
      location: `Core / RBAC / ${role.slug}`,
      keywords: [role.slug, "rbac", "role", ...role.permissionIds],
      tags: ["core", "rbac"],
      status: "active"
    })),
    ...defaultCorePermissions.map((permission) => ({
      id: permission.id,
      domain: "core" as const,
      kind: "permission",
      title: permission.id,
      summary: `${permission.action} access on ${permission.resource}.`,
      location: `Core / Permissions / ${permission.resource}`,
      keywords: [permission.resource, permission.action, "permission"],
      tags: ["core", "rbac"],
      status: "active"
    })),
    ...referenceVrfs.map((vrf) => ({
      id: vrf.id,
      domain: "ipam" as const,
      kind: "vrf",
      title: vrf.name,
      summary: `VRF ${vrf.rd ?? "unassigned"} with ${vrf.tenantId ?? "shared"} tenancy.`,
      location: `IPAM / VRFs / ${vrf.name}`,
      keywords: [vrf.name, vrf.rd ?? "", "vrf"],
      tags: ["ipam", "vrf"],
      status: "active"
    })),
    ...createIpamTreeResponse().prefixes.map((prefix) => ({
      id: prefix.id,
      domain: "ipam" as const,
      kind: "prefix",
      title: prefix.cidr,
      summary: `${prefix.status} ${prefix.allocationMode} prefix in ${prefix.vrfId ?? "global"} scope.`,
      location: `IPAM / Prefixes / ${prefix.cidr}`,
      keywords: [prefix.cidr, prefix.status, prefix.allocationMode, prefix.vrfId ?? ""],
      tags: ["ipam", "prefix"],
      status: prefix.status
    })),
    ...referenceAddresses.map((address) => ({
      id: address.id,
      domain: "ipam" as const,
      kind: "ip-address",
      title: address.address,
      summary: `${address.role} address bound to ${address.interfaceId ?? "unassigned interface"}.`,
      location: `IPAM / Addresses / ${address.address}`,
      keywords: [address.address, address.role, address.interfaceId ?? "", "ip"],
      tags: ["ipam", "address"],
      status: address.status
    })),
    ...referenceVlans.map((vlan) => ({
      id: vlan.id,
      domain: "ipam" as const,
      kind: "vlan",
      title: `${vlan.name} (VLAN ${vlan.vlanId})`,
      summary: `${vlan.interfaceIds.length} interfaces assigned to VLAN ${vlan.vlanId}.`,
      location: `IPAM / VLANs / ${vlan.vlanId}`,
      keywords: [vlan.name, String(vlan.vlanId), "vlan"],
      tags: ["ipam", "vlan"],
      status: vlan.status
    })),
    ...referenceSites.map((site) => ({
      id: site.id,
      domain: "dcim" as const,
      kind: "site",
      title: site.name,
      summary: `Physical site ${site.slug} for tenant ${site.tenantId ?? "shared"}.`,
      location: `DCIM / Sites / ${site.slug}`,
      keywords: [site.slug, site.name, "site"],
      tags: ["dcim", "site"],
      status: "active"
    })),
    ...referenceRacks.map((rack) => ({
      id: rack.id,
      domain: "dcim" as const,
      kind: "rack",
      title: rack.name,
      summary: `${rack.totalUnits}U rack in site ${rack.siteId}.`,
      location: `DCIM / Racks / ${rack.name}`,
      keywords: [rack.name, rack.siteId, "rack", `${rack.totalUnits}u`],
      tags: ["dcim", "rack"],
      status: "active"
    })),
    ...rackResponse.rack.devices.map((device) => ({
      id: device.id,
      domain: "dcim" as const,
      kind: "device",
      title: device.name,
      summary: `${device.role} occupying ${device.heightUnits}U starting at U${device.startUnit}.`,
      location: `DCIM / Devices / ${device.name}`,
      keywords: [device.name, device.role, device.tone, ...device.ports.map((port) => port.label)],
      tags: ["dcim", "device", device.tone],
      status: "active"
    })),
    ...topologyResponse.graph.nodes.map((node) => ({
      id: node.id,
      domain: "operations" as const,
      kind: "topology-node",
      title: node.label,
      summary: `${node.role} in ${node.siteName} with ${node.interfaceCount} interfaces.`,
      location: `Operations / Topology / ${node.siteName}`,
      keywords: [node.label, node.role, node.siteName, ...node.vlanIds],
      tags: ["operations", "topology"],
      status: "live"
    })),
    ...topologyResponse.graph.edges.map((edge) => ({
      id: edge.id,
      domain: "operations" as const,
      kind: edge.kind,
      title: edge.label,
      summary: `${edge.kind} relationship between ${edge.fromNodeId} and ${edge.toNodeId}.`,
      location: `Operations / Topology / ${edge.siteId}`,
      keywords: [edge.label, edge.kind, edge.fromNodeId, edge.toNodeId, ...edge.vlanIds],
      tags: ["operations", "topology", edge.kind],
      status: "live"
    })),
    {
      id: "automation-job-catalog",
      domain: "automation" as const,
      kind: "job-catalog",
      title: "Automation job catalog",
      summary: "Future automation, import, export, and webhook catalog placeholder.",
      location: "Automation / Jobs / Planned",
      keywords: ["automation", "jobs", "webhooks", "imports", "exports"],
      tags: ["automation", "planned"],
      status: "planned"
    }
  ];
}

function createSearchResponse(queryText: string, domain: SearchDomain | "all"): ApiSearchResponse {
  const records = createSearchRecords();
  const query = createSearchQuery(queryText, domain);
  const domainAgnosticMatches = searchRecords(records, createSearchQuery(queryText, "all"));
  const matches = searchRecords(records, query);
  const groups = groupSearchResults(matches);

  return {
    generatedAt: new Date().toISOString(),
    query: query.text,
    selectedDomain: domain,
    totalResults: matches.length,
    availableDomains: getSearchDomainOptions().map((option) => ({
      value: option.value,
      label: option.label,
      count:
        option.value === "all"
          ? domainAgnosticMatches.length
          : domainAgnosticMatches.filter((match) => match.record.domain === option.value).length
    })),
    groups: groups.map((group) => ({
      domain: group.domain,
      label: group.label,
      results: group.results.map((match) => ({
        id: match.record.id,
        domain: match.record.domain,
        domainLabel: getSearchDomainLabel(match.record.domain),
        kind: match.record.kind,
        title: match.record.title,
        summary: match.record.summary,
        location: match.record.location,
        status: match.record.status,
        matchedTerms: match.matchedTerms,
        tags: match.record.tags,
        score: match.score
      }))
    })),
    guidance: [
      "Search results are generated from explicit domain records, not direct UI-side joins.",
      "Keyword and partial-match scoring stays deterministic so future indexing can preserve behavior.",
      "Domain filters narrow the centralized result set without changing the underlying search contract."
    ]
  };
}

function createRackResponse(): ApiRackResponse {
  return {
    generatedAt: new Date().toISOString(),
    rack: {
      id: "rack-a1",
      name: "A1",
      siteName: "Dallas One",
      totalUnits: 42,
      devices: [
        {
          id: "device-leaf-sw1",
          name: "leaf-sw1",
          role: "Top-of-rack switch",
          tone: "network",
          startUnit: 40,
          heightUnits: 2,
          ports: [
            {
              id: "port-leaf-sw1-1",
              label: "xe-0/0/1",
              side: "left",
              status: "connected",
              cableId: "cable-leaf-a",
              peerPortLabel: "xe-0/0/1"
            },
            {
              id: "port-leaf-sw1-2",
              label: "xe-0/0/2",
              side: "right",
              status: "connected",
              cableId: "cable-host-a",
              peerPortLabel: "eth0"
            },
            {
              id: "port-leaf-sw1-mgmt",
              label: "mgmt0",
              side: "left",
              status: "available",
              cableId: null,
              peerPortLabel: null
            }
          ]
        },
        {
          id: "device-leaf-sw2",
          name: "leaf-sw2",
          role: "Top-of-rack switch",
          tone: "network",
          startUnit: 38,
          heightUnits: 2,
          ports: [
            {
              id: "port-leaf-sw2-1",
              label: "xe-0/0/1",
              side: "left",
              status: "connected",
              cableId: "cable-leaf-a",
              peerPortLabel: "xe-0/0/1"
            },
            {
              id: "port-leaf-sw2-2",
              label: "xe-0/0/2",
              side: "right",
              status: "connected",
              cableId: "cable-host-b",
              peerPortLabel: "eth0"
            },
            {
              id: "port-leaf-sw2-mgmt",
              label: "mgmt0",
              side: "left",
              status: "available",
              cableId: null,
              peerPortLabel: null
            }
          ]
        },
        {
          id: "device-server-01",
          name: "compute-01",
          role: "Application host",
          tone: "compute",
          startUnit: 30,
          heightUnits: 2,
          ports: [
            {
              id: "port-server-01-eth0",
              label: "eth0",
              side: "left",
              status: "connected",
              cableId: "cable-host-a",
              peerPortLabel: "xe-0/0/2"
            },
            {
              id: "port-server-01-eth1",
              label: "eth1",
              side: "right",
              status: "available",
              cableId: null,
              peerPortLabel: null
            }
          ]
        },
        {
          id: "device-server-02",
          name: "compute-02",
          role: "Application host",
          tone: "compute",
          startUnit: 26,
          heightUnits: 2,
          ports: [
            {
              id: "port-server-02-eth0",
              label: "eth0",
              side: "left",
              status: "connected",
              cableId: "cable-host-b",
              peerPortLabel: "xe-0/0/2"
            },
            {
              id: "port-server-02-eth1",
              label: "eth1",
              side: "right",
              status: "disabled",
              cableId: null,
              peerPortLabel: null
            }
          ]
        },
        {
          id: "device-pdu-a",
          name: "pdu-a",
          role: "Power distribution",
          tone: "power",
          startUnit: 10,
          heightUnits: 4,
          ports: [
            {
              id: "port-pdu-a-feed1",
              label: "feed-a",
              side: "left",
              status: "connected",
              cableId: "cable-power-a",
              peerPortLabel: "psu-a"
            }
          ]
        }
      ],
      cables: [
        {
          id: "cable-leaf-a",
          fromDeviceId: "device-leaf-sw1",
          fromPortId: "port-leaf-sw1-1",
          fromPortLabel: "xe-0/0/1",
          toDeviceId: "device-leaf-sw2",
          toPortId: "port-leaf-sw2-1",
          toPortLabel: "xe-0/0/1"
        },
        {
          id: "cable-host-a",
          fromDeviceId: "device-leaf-sw1",
          fromPortId: "port-leaf-sw1-2",
          fromPortLabel: "xe-0/0/2",
          toDeviceId: "device-server-01",
          toPortId: "port-server-01-eth0",
          toPortLabel: "eth0"
        },
        {
          id: "cable-host-b",
          fromDeviceId: "device-leaf-sw2",
          fromPortId: "port-leaf-sw2-2",
          fromPortLabel: "xe-0/0/2",
          toDeviceId: "device-server-02",
          toPortId: "port-server-02-eth0",
          toPortLabel: "eth0"
        },
        {
          id: "cable-power-a",
          fromDeviceId: "device-pdu-a",
          fromPortId: "port-pdu-a-feed1",
          fromPortLabel: "feed-a",
          toDeviceId: "device-server-01",
          toPortId: "port-server-01-eth0",
          toPortLabel: "psu-a"
        }
      ]
    },
    guidance: [
      "Devices are positioned by explicit starting U and height.",
      "Port chips are selectable and cable relationships stay explicit.",
      "Basic cable rendering is intentionally lightweight until topology visualization lands."
    ]
  };
}

function createTopologyResponse(): ApiTopologyResponse {
  const graph = createTopologyView(
    [
      {
        id: "device-spine-sw1",
        name: "spine-sw1",
        role: "Spine",
        tone: "network",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["spine-sw1:xe-0/0/1", "spine-sw1:xe-0/0/2", "spine-sw1:xe-0/0/3"],
        vlanIds: ["vlan-120", "vlan-410"]
      },
      {
        id: "device-leaf-sw1",
        name: "leaf-sw1",
        role: "Top-of-rack switch",
        tone: "network",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["leaf-sw1:xe-0/0/1", "leaf-sw1:xe-0/0/2", "leaf-sw1:xe-0/0/48"],
        vlanIds: ["vlan-120"]
      },
      {
        id: "device-leaf-sw2",
        name: "leaf-sw2",
        role: "Top-of-rack switch",
        tone: "network",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["leaf-sw2:xe-0/0/1", "leaf-sw2:xe-0/0/2", "leaf-sw2:xe-0/0/48"],
        vlanIds: ["vlan-120", "vlan-410"]
      },
      {
        id: "device-compute-01",
        name: "compute-01",
        role: "Application host",
        tone: "compute",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["compute-01:eth0", "compute-01:eth1"],
        vlanIds: ["vlan-120"]
      },
      {
        id: "device-storage-01",
        name: "storage-01",
        role: "Storage host",
        tone: "storage",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["storage-01:eth0", "storage-01:eth1"],
        vlanIds: ["vlan-410"]
      },
      {
        id: "device-pdu-a",
        name: "pdu-a",
        role: "Power distribution",
        tone: "power",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["pdu-a:feed-a", "pdu-a:feed-b"],
        vlanIds: []
      },
      {
        id: "device-leaf-phx1",
        name: "leaf-phx1",
        role: "Top-of-rack switch",
        tone: "network",
        siteId: "site-phx1",
        siteName: "Phoenix One",
        interfaceIds: ["leaf-phx1:xe-0/0/1", "leaf-phx1:xe-0/0/2"],
        vlanIds: ["vlan-220"]
      },
      {
        id: "device-compute-phx1",
        name: "compute-phx1",
        role: "Application host",
        tone: "compute",
        siteId: "site-phx1",
        siteName: "Phoenix One",
        interfaceIds: ["compute-phx1:eth0"],
        vlanIds: ["vlan-220"]
      }
    ],
    [
      {
        id: "cable-spine-leaf1",
        fromDeviceId: "device-spine-sw1",
        toDeviceId: "device-leaf-sw1",
        kind: "cable-link",
        label: "uplink-a",
        vlanIds: ["vlan-120"]
      },
      {
        id: "cable-spine-leaf2",
        fromDeviceId: "device-spine-sw1",
        toDeviceId: "device-leaf-sw2",
        kind: "cable-link",
        label: "uplink-b",
        vlanIds: ["vlan-120", "vlan-410"]
      },
      {
        id: "cable-leaf1-host1",
        fromDeviceId: "device-leaf-sw1",
        toDeviceId: "device-compute-01",
        kind: "l2-adjacency",
        label: "server access",
        vlanIds: ["vlan-120"]
      },
      {
        id: "cable-leaf2-storage1",
        fromDeviceId: "device-leaf-sw2",
        toDeviceId: "device-storage-01",
        kind: "vlan-propagation",
        label: "storage fabric",
        vlanIds: ["vlan-410"]
      },
      {
        id: "cable-pdu-host1",
        fromDeviceId: "device-pdu-a",
        toDeviceId: "device-compute-01",
        kind: "cable-link",
        label: "power feed",
        vlanIds: []
      },
      {
        id: "cable-phx-leaf-host",
        fromDeviceId: "device-leaf-phx1",
        toDeviceId: "device-compute-phx1",
        kind: "l3-adjacency",
        label: "remote workload",
        vlanIds: ["vlan-220"]
      }
    ]
  );

  return {
    generatedAt: new Date().toISOString(),
    graph,
    guidance: [
      "Topology edges are explicit and never inferred from naming.",
      "Layout is deterministic so the same inventory produces the same visual ordering.",
      "Filtering is applied against site, role, and VLAN tags before the graph reaches the canvas."
    ]
  };
}

function createIpamTreeResponse(): ApiIpamTreeResponse {
  const prefixes: readonly Prefix[] = [
    {
      id: "prefix-global-root",
      vrfId: "vrf-global",
      parentPrefixId: null,
      cidr: "10.40.0.0/16",
      family: 4,
      status: "active",
      allocationMode: "hierarchical",
      tenantId: "tenant-net",
      vlanId: null
    },
    {
      id: "prefix-global-services",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-root",
      cidr: "10.40.0.0/20",
      family: 4,
      status: "active",
      allocationMode: "hierarchical",
      tenantId: "tenant-net",
      vlanId: null
    },
    {
      id: "prefix-global-prod",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-root",
      cidr: "10.40.16.0/20",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-net",
      vlanId: "vlan-120"
    },
    {
      id: "prefix-global-apps",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-prod",
      cidr: "10.40.16.0/24",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-net",
      vlanId: "vlan-120"
    },
    {
      id: "prefix-global-storage",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-prod",
      cidr: "10.40.17.0/24",
      family: 4,
      status: "reserved",
      allocationMode: "static",
      tenantId: "tenant-net",
      vlanId: "vlan-410"
    },
    {
      id: "prefix-campus-root",
      vrfId: "vrf-campus",
      parentPrefixId: null,
      cidr: "172.20.0.0/16",
      family: 4,
      status: "active",
      allocationMode: "hierarchical",
      tenantId: "tenant-ops",
      vlanId: null
    },
    {
      id: "prefix-campus-users",
      vrfId: "vrf-campus",
      parentPrefixId: "prefix-campus-root",
      cidr: "172.20.10.0/24",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-ops",
      vlanId: "vlan-220"
    },
    {
      id: "prefix-campus-wireless",
      vrfId: "vrf-campus",
      parentPrefixId: "prefix-campus-root",
      cidr: "172.20.20.0/24",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-ops",
      vlanId: "vlan-221"
    }
  ];
  const ipAddresses: readonly IpAddress[] = [
    {
      id: "ip-app-01",
      vrfId: "vrf-global",
      address: "10.40.16.10/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "compute-01:eth0"
    },
    {
      id: "ip-app-02",
      vrfId: "vrf-global",
      address: "10.40.16.11/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "compute-02:eth0"
    },
    {
      id: "ip-storage-01",
      vrfId: "vrf-global",
      address: "10.40.17.40/24",
      family: 4,
      status: "reserved",
      role: "primary",
      prefixId: "prefix-global-storage",
      interfaceId: "storage-01:eth0"
    },
    {
      id: "ip-campus-user-01",
      vrfId: "vrf-campus",
      address: "172.20.10.25/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-campus-users",
      interfaceId: "access-01:vlan220"
    },
    {
      id: "ip-campus-wireless-01",
      vrfId: "vrf-campus",
      address: "172.20.20.40/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-campus-wireless",
      interfaceId: "wlc-01:vlan221"
    }
  ];
  const hierarchyValidation = validatePrefixHierarchy(prefixes);
  const hierarchy = buildPrefixHierarchy(prefixes);
  const utilization = [...createPrefixUtilizationDirectory(prefixes, ipAddresses).values()];

  return {
    generatedAt: new Date().toISOString(),
    vrfs: referenceVrfs,
    prefixes,
    ipAddresses: ipAddresses.map((address) => ({ prefixId: address.prefixId })),
    hierarchy,
    utilization,
    guidance: [
      hierarchyValidation.reason,
      "VRFs are rendered as the top grouping boundary before prefix nesting begins.",
      "Utilization bars are precomputed to keep the tree renderer focused on interaction."
    ]
  };
}

function createDomainResponse(): ApiOverviewResponse {
  const validPrefixes = referencePrefixes.filter((prefix) => validatePrefix(prefix).valid).length;
  const validAddresses = referenceAddresses.filter((address) => validateIpAddress(address).valid).length;
  const rackPlacement = validateRackPosition(referenceRacks[0], {
    rackId: "rack-a1",
    face: "front",
    startingUnit: 18,
    heightUnits: 2
  });
  const cableValidation = validateCable({
    id: "cable-leaf-1",
    kind: "data",
    aSide: { deviceId: "device-leaf-sw1", interfaceId: "xe-0/0/1" },
    zSide: { deviceId: "device-leaf-sw2", interfaceId: "xe-0/0/1" },
    status: "connected"
  });
  const topologyValidation = validateTopologyEdge({
    id: "edge-l2-leaf",
    kind: "l2-adjacency",
    fromId: "interface-leaf-sw1",
    toId: "interface-leaf-sw2",
    metadata: { cableId: "cable-leaf-1" }
  });
  const interfaceBinding = validateInterfaceIpBinding({
    id: "binding-ip-leaf",
    interfaceId: "interface-leaf-sw1",
    ipAddressId: "ip-leaf-sw1",
    vrfId: "vrf-global",
    prefixId: "prefix-leaf",
    role: "primary"
  });
  const vlanBinding = validateInterfaceVlanBinding({
    id: "binding-vlan-leaf",
    interfaceId: "interface-leaf-sw1",
    vlanId: "vlan-120",
    mode: "access",
    tagged: false
  });
  const trace = tracePath(
    [
      {
        id: "edge-l2-leaf",
        kind: "l2-adjacency",
        fromId: "interface-leaf-sw1",
        toId: "interface-leaf-sw2",
        metadata: { cableId: "cable-leaf-1" }
      },
      {
        id: "edge-l3-leaf",
        kind: "l3-adjacency",
        fromId: "interface-leaf-sw2",
        toId: "ip-leaf-sw2",
        metadata: { bindingId: "binding-ip-leaf-sw2" }
      }
    ],
    {
      startNodeId: "interface-leaf-sw1",
      targetNodeId: "ip-leaf-sw2",
      allowedKinds: ["l2-adjacency", "l3-adjacency"],
      maxDepth: 3
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      name: workspaceMetadata.name,
      runtime: workspaceMetadata.runtime,
      boundary: platformBoundaries.api
    },
    domains: [
      {
        id: "overview",
        title: "Platform Overview",
        status: "ready",
        summary: "UI integration now consumes backend domain summaries through a stable API layer.",
        metrics: [
          { label: "Active domains", value: "6" },
          { label: "Reference tenants", value: String(referenceTenants.length) },
          { label: "Stable trace path", value: trace.found ? `${trace.path.length} hops` : "unresolved" }
        ],
        indicators: [
          "API payloads are normalized before rendering",
          "Loading and retry states are explicit",
          "UI shell no longer depends on static panel copy"
        ]
      },
      {
        id: "core",
        title: "Core Platform",
        status: "ready",
        summary: "Identity and policy data are exposed as a compact control-plane summary for UI consumption.",
        metrics: [
          { label: "Roles", value: String(defaultCoreRoles.length) },
          { label: "Permissions", value: String(defaultCorePermissions.length) },
          { label: "Tenant statuses", value: String(defaultTenantStatuses.length) }
        ],
        indicators: [
          "Tenancy summary available",
          "Permission catalog exposed by API",
          "Audit-ready control-plane framing retained"
        ]
      },
      {
        id: "ipam",
        title: "IPAM",
        status: validPrefixes === referencePrefixes.length && validAddresses === referenceAddresses.length ? "ready" : "attention",
        summary: "Addressing data is delivered as normalized VRF, prefix, address, and VLAN counts with validation context.",
        metrics: [
          { label: "Prefixes", value: String(referencePrefixes.length) },
          { label: "Addresses", value: String(referenceAddresses.length) },
          { label: "VLANs", value: String(referenceVlans.length) }
        ],
        indicators: [
          `${validPrefixes}/${referencePrefixes.length} reference prefixes validate`,
          `${validAddresses}/${referenceAddresses.length} reference addresses validate`,
          vlanBinding.reason
        ]
      },
      {
        id: "dcim",
        title: "DCIM",
        status: rackPlacement.valid && cableValidation.valid ? "ready" : "attention",
        summary: "Physical inventory data is exposed through site, rack, and cable summaries that preserve explicit relationships.",
        metrics: [
          { label: "Sites", value: String(referenceSites.length) },
          { label: "Racks", value: String(referenceRacks.length) },
          { label: "Cable checks", value: cableValidation.valid ? "passing" : "blocked" }
        ],
        indicators: [
          rackPlacement.reason,
          cableValidation.reason,
          "Rack and cable relationships remain explicit"
        ]
      },
      {
        id: "automation",
        title: "Automation",
        status: "planned",
        summary: "Jobs, imports, exports, and webhook automation remain queued for a later domain implementation chunk.",
        metrics: [
          { label: "Queued jobs", value: "0" },
          { label: "Webhook contracts", value: "planned" },
          { label: "Import pipelines", value: "planned" }
        ],
        indicators: [
          "UI uses a stable placeholder contract",
          "No domain implementation leak into the shell",
          "Ready for future mutation workflows"
        ]
      },
      {
        id: "operations",
        title: "Operations",
        status: interfaceBinding.valid && topologyValidation.valid ? "ready" : "attention",
        summary: "Operational visibility shows API boundary health, UI contract stability, and topology integration readiness.",
        metrics: [
          { label: "API boundary", value: "stable" },
          { label: "Path tracing", value: trace.reason },
          { label: "Topology edges", value: topologyValidation.valid ? "valid" : "invalid" }
        ],
        indicators: [
          interfaceBinding.reason,
          topologyValidation.reason,
          "Retry-safe fetch behavior is active in the shell"
        ]
      }
    ],
    notices: [
      "Backend payloads are normalized in the web layer before rendering.",
      "Error handling keeps transport failures separate from empty-domain states.",
      "Domain IDs remain explicit to avoid schema coupling in the shell."
    ]
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

export function handleApiRequest(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/overview") {
    sendJson(response, 200, createDomainResponse());

    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/racks/demo") {
    sendJson(response, 200, createRackResponse());

    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/topology/demo") {
    sendJson(response, 200, createTopologyResponse());

    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/ipam-tree/demo") {
    sendJson(response, 200, createIpamTreeResponse());

    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/search") {
    const rawDomain = requestUrl.searchParams.get("domain");
    const domain: SearchDomain | "all" =
      rawDomain === "core" ||
      rawDomain === "ipam" ||
      rawDomain === "dcim" ||
      rawDomain === "operations" ||
      rawDomain === "automation"
        ? rawDomain
        : "all";

    sendJson(response, 200, createSearchResponse(requestUrl.searchParams.get("q") ?? "", domain));

    return;
  }

  if (requestUrl.pathname.startsWith("/api/import")) {
    void handleImportApiRequest(request, response).then((handled) => {
      if (!handled) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
          }
        });
      }
    });

    return;
  }

  if (requestUrl.pathname.startsWith("/api/inventory")) {
    void handleInventoryApiRequest(request, response).then((handled) => {
      if (!handled) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
          }
        });
      }
    });

    return;
  }

  if (requestUrl.pathname.startsWith("/api/export")) {
    void handleExportApiRequest(request, response).then((handled) => {
      if (!handled) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
          }
        });
      }
    });

    return;
  }

  if (requestUrl.pathname.startsWith("/api/media")) {
    void handleMediaApiRequest(request, response).then((handled) => {
      if (!handled) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
          }
        });
      }
    });

    return;
  }

  if (requestUrl.pathname.startsWith("/api/jobs")) {
    void handleJobsApiRequest(request, response).then((handled) => {
      if (!handled) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
          }
        });
      }
    });

    return;
  }

  sendJson(response, 404, {
    error: {
      code: "not_found",
      message: `No API route matched ${request.method ?? "GET"} ${requestUrl.pathname}`
    }
  });
}

export function describeApiSurface(): string {
  return `${workspaceMetadata.name} API boundary: ${platformBoundaries.api}`;
}

export function startApiServer(port = Number(process.env["INFRALYNX_API_PORT"] ?? "4010")) {
  const server = createServer(handleApiRequest);

  server.listen(port, () => {
    console.log(`${describeApiSurface()} on http://localhost:${port}/api/overview`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApiServer();
}
