import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import {
  defaultCorePermissions,
  defaultCoreRoles,
  defaultTenantStatuses,
  type Tenant
} from "../../../packages/core-domain/dist/index.js";
import { type Rack, type Site, validateCable, validateRackPosition } from "../../../packages/dcim-domain/dist/index.js";
import { platformBoundaries } from "../../../packages/domain-core/dist/index.js";
import { type IpAddress, type Prefix, type Vlan, validateIpAddress, validatePrefix } from "../../../packages/ipam-domain/dist/index.js";
import {
  tracePath,
  validateInterfaceIpBinding,
  validateInterfaceVlanBinding,
  validateTopologyEdge
} from "../../../packages/network-domain/dist/index.js";

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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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
