import { type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type Tenant
} from "../../../../packages/core-domain/dist/index.js";
import {
  type Device,
  type DeviceRole,
  type Interface,
  type Rack,
  type RackFace,
  type Site,
  canOccupyRackPosition,
  validateRackPosition
} from "../../../../packages/dcim-domain/dist/index.js";
import {
  type IpAddress,
  type Prefix,
  type Vrf,
  buildPrefixHierarchy,
  createPrefixUtilizationDirectory,
  validateIpAddress,
  validatePrefix,
  validatePrefixHierarchy
} from "../../../../packages/ipam-domain/dist/index.js";

type WritableInventoryResource = "sites" | "racks" | "devices" | "prefixes" | "ip-addresses";
type ReadOnlyInventoryResource =
  | "tenants"
  | "users"
  | "vrfs"
  | "interfaces"
  | "connections";
type InventoryResource = WritableInventoryResource | ReadOnlyInventoryResource;

interface UserSummary {
  readonly id: string;
  readonly subject: string;
  readonly displayName: string;
  readonly tenantId: string;
  readonly roleIds: readonly string[];
  readonly status: "active" | "invited";
}

interface ConnectionSummary {
  readonly id: string;
  readonly kind: "data" | "power";
  readonly label: string;
  readonly fromDeviceId: string;
  readonly fromInterfaceId: string;
  readonly toDeviceId: string;
  readonly toInterfaceId: string;
  readonly status: "connected" | "planned";
}

interface InventoryState {
  readonly sites: readonly Site[];
  readonly racks: readonly Rack[];
  readonly devices: readonly Device[];
  readonly prefixes: readonly Prefix[];
  readonly ipAddresses: readonly IpAddress[];
}

interface InventoryContext {
  readonly tenants: readonly Tenant[];
  readonly users: readonly UserSummary[];
  readonly vrfs: readonly Vrf[];
  readonly interfaces: readonly Interface[];
  readonly connections: readonly ConnectionSummary[];
  readonly state: InventoryState;
}

type InventoryRecordMap = {
  readonly sites: Site;
  readonly racks: Rack;
  readonly devices: Device;
  readonly prefixes: Prefix;
  readonly "ip-addresses": IpAddress;
  readonly tenants: Tenant;
  readonly users: UserSummary;
  readonly vrfs: Vrf;
  readonly interfaces: Interface;
  readonly connections: ConnectionSummary;
};

interface ApiListResponse<TRecord> {
  readonly resource: InventoryResource;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly sort: {
    readonly field: string;
    readonly direction: "asc" | "desc";
  };
  readonly filters: Record<string, string>;
  readonly items: readonly TRecord[];
}

interface ApiDetailResponse<TRecord> {
  readonly resource: InventoryResource;
  readonly record: TRecord;
  readonly related: Record<string, unknown>;
}

interface ValidationFailure {
  readonly field: string;
  readonly message: string;
}

interface InventoryMutationResult<TRecord> {
  readonly valid: boolean;
  readonly errors: readonly ValidationFailure[];
  readonly record: TRecord | null;
}

const inventoryRootDirectory = resolve(process.cwd(), "runtime-data/inventory");
const inventoryStateFilePath = resolve(inventoryRootDirectory, "state.json");
const inventoryStateLockPath = `${inventoryStateFilePath}.lock`;

const referenceTenants: readonly Tenant[] = [
  { id: "tenant-ops", slug: "operations", name: "Operations", status: "active" },
  { id: "tenant-net", slug: "network-engineering", name: "Network Engineering", status: "active" }
] as const;

const referenceUsers: readonly UserSummary[] = [
  {
    id: "user-platform-admin",
    subject: "gabe.jensen@infralynx.local",
    displayName: "Gabe Jensen",
    tenantId: "tenant-ops",
    roleIds: ["core-platform-admin"],
    status: "active"
  },
  {
    id: "user-network-operator",
    subject: "operator@infralynx.local",
    displayName: "Network Operator",
    tenantId: "tenant-net",
    roleIds: ["core-auditor"],
    status: "active"
  }
] as const;

const referenceVrfs: readonly Vrf[] = [
  { id: "vrf-global", name: "Global Services", rd: "65000:10", tenantId: "tenant-net" },
  { id: "vrf-campus", name: "Campus Access", rd: "65000:20", tenantId: "tenant-ops" }
] as const;

const referenceInterfaces: readonly Interface[] = [
  {
    id: "iface-leaf-sw1-uplink",
    deviceId: "device-leaf-sw1",
    name: "xe-0/0/1",
    kind: "fiber",
    enabled: true,
    vlanIds: ["vlan-120"],
    ipAddressIds: [],
    cableId: "conn-spine-leaf1"
  },
  {
    id: "iface-leaf-sw1-server",
    deviceId: "device-leaf-sw1",
    name: "xe-0/0/2",
    kind: "ethernet",
    enabled: true,
    vlanIds: ["vlan-120"],
    ipAddressIds: [],
    cableId: "conn-leaf1-app1"
  },
  {
    id: "iface-leaf-sw1-mgmt",
    deviceId: "device-leaf-sw1",
    name: "mgmt0",
    kind: "management",
    enabled: true,
    vlanIds: [],
    ipAddressIds: ["ip-leaf-sw1-mgmt"],
    cableId: null
  },
  {
    id: "iface-leaf-sw2-uplink",
    deviceId: "device-leaf-sw2",
    name: "xe-0/0/1",
    kind: "fiber",
    enabled: true,
    vlanIds: ["vlan-120", "vlan-410"],
    ipAddressIds: [],
    cableId: "conn-spine-leaf2"
  },
  {
    id: "iface-leaf-sw2-storage",
    deviceId: "device-leaf-sw2",
    name: "xe-0/0/2",
    kind: "ethernet",
    enabled: true,
    vlanIds: ["vlan-410"],
    ipAddressIds: [],
    cableId: "conn-leaf2-storage1"
  },
  {
    id: "iface-leaf-sw2-mgmt",
    deviceId: "device-leaf-sw2",
    name: "mgmt0",
    kind: "management",
    enabled: true,
    vlanIds: [],
    ipAddressIds: ["ip-leaf-sw2-mgmt"],
    cableId: null
  },
  {
    id: "iface-compute-01-eth0",
    deviceId: "device-compute-01",
    name: "eth0",
    kind: "ethernet",
    enabled: true,
    vlanIds: ["vlan-120"],
    ipAddressIds: ["ip-app-01"],
    cableId: "conn-leaf1-app1"
  },
  {
    id: "iface-compute-02-eth0",
    deviceId: "device-compute-02",
    name: "eth0",
    kind: "ethernet",
    enabled: true,
    vlanIds: ["vlan-120"],
    ipAddressIds: ["ip-app-02"],
    cableId: null
  },
  {
    id: "iface-storage-01-eth0",
    deviceId: "device-storage-01",
    name: "eth0",
    kind: "ethernet",
    enabled: true,
    vlanIds: ["vlan-410"],
    ipAddressIds: ["ip-storage-01"],
    cableId: "conn-leaf2-storage1"
  }
] as const;

const referenceConnections: readonly ConnectionSummary[] = [
  {
    id: "conn-spine-leaf1",
    kind: "data",
    label: "Spine uplink A",
    fromDeviceId: "device-spine-sw1",
    fromInterfaceId: "iface-spine-sw1-leaf1",
    toDeviceId: "device-leaf-sw1",
    toInterfaceId: "iface-leaf-sw1-uplink",
    status: "connected"
  },
  {
    id: "conn-spine-leaf2",
    kind: "data",
    label: "Spine uplink B",
    fromDeviceId: "device-spine-sw1",
    fromInterfaceId: "iface-spine-sw1-leaf2",
    toDeviceId: "device-leaf-sw2",
    toInterfaceId: "iface-leaf-sw2-uplink",
    status: "connected"
  },
  {
    id: "conn-leaf1-app1",
    kind: "data",
    label: "Application server access",
    fromDeviceId: "device-leaf-sw1",
    fromInterfaceId: "iface-leaf-sw1-server",
    toDeviceId: "device-compute-01",
    toInterfaceId: "iface-compute-01-eth0",
    status: "connected"
  },
  {
    id: "conn-leaf2-storage1",
    kind: "data",
    label: "Storage access",
    fromDeviceId: "device-leaf-sw2",
    fromInterfaceId: "iface-leaf-sw2-storage",
    toDeviceId: "device-storage-01",
    toInterfaceId: "iface-storage-01-eth0",
    status: "connected"
  }
] as const;

const defaultInventoryState: InventoryState = {
  sites: [
    { id: "site-dal1", slug: "dal1", name: "Dallas One", tenantId: "tenant-ops" },
    { id: "site-phx1", slug: "phx1", name: "Phoenix One", tenantId: "tenant-ops" }
  ],
  racks: [
    { id: "rack-dal1-a1", siteId: "site-dal1", name: "A1", totalUnits: 42 },
    { id: "rack-dal1-a2", siteId: "site-dal1", name: "A2", totalUnits: 42 },
    { id: "rack-phx1-b1", siteId: "site-phx1", name: "B1", totalUnits: 42 }
  ],
  devices: [
    {
      id: "device-spine-sw1",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a2", face: "front", startingUnit: 40, heightUnits: 2 },
      name: "spine-sw1",
      role: "switch",
      status: "active"
    },
    {
      id: "device-leaf-sw1",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a1", face: "front", startingUnit: 40, heightUnits: 2 },
      name: "leaf-sw1",
      role: "switch",
      status: "active"
    },
    {
      id: "device-leaf-sw2",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a1", face: "front", startingUnit: 38, heightUnits: 2 },
      name: "leaf-sw2",
      role: "switch",
      status: "active"
    },
    {
      id: "device-compute-01",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a1", face: "front", startingUnit: 30, heightUnits: 2 },
      name: "compute-01",
      role: "server",
      status: "active"
    },
    {
      id: "device-compute-02",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a1", face: "front", startingUnit: 26, heightUnits: 2 },
      name: "compute-02",
      role: "server",
      status: "planned"
    },
    {
      id: "device-storage-01",
      siteId: "site-dal1",
      rackPosition: { rackId: "rack-dal1-a2", face: "front", startingUnit: 28, heightUnits: 4 },
      name: "storage-01",
      role: "server",
      status: "active"
    }
  ],
  prefixes: [
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
      id: "prefix-global-apps",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-root",
      cidr: "10.40.16.0/24",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-net",
      vlanId: null
    },
    {
      id: "prefix-global-storage",
      vrfId: "vrf-global",
      parentPrefixId: "prefix-global-root",
      cidr: "10.40.17.0/24",
      family: 4,
      status: "reserved",
      allocationMode: "pool",
      tenantId: "tenant-net",
      vlanId: null
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
    }
  ],
  ipAddresses: [
    {
      id: "ip-leaf-sw1-mgmt",
      vrfId: "vrf-global",
      address: "10.40.0.10/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "iface-leaf-sw1-mgmt"
    },
    {
      id: "ip-leaf-sw2-mgmt",
      vrfId: "vrf-global",
      address: "10.40.0.11/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "iface-leaf-sw2-mgmt"
    },
    {
      id: "ip-app-01",
      vrfId: "vrf-global",
      address: "10.40.16.10/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "iface-compute-01-eth0"
    },
    {
      id: "ip-app-02",
      vrfId: "vrf-global",
      address: "10.40.16.11/24",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-global-apps",
      interfaceId: "iface-compute-02-eth0"
    },
    {
      id: "ip-storage-01",
      vrfId: "vrf-global",
      address: "10.40.17.25/24",
      family: 4,
      status: "reserved",
      role: "primary",
      prefixId: "prefix-global-storage",
      interfaceId: "iface-storage-01-eth0"
    }
  ]
};

const writableResources = new Set<WritableInventoryResource>([
  "sites",
  "racks",
  "devices",
  "prefixes",
  "ip-addresses"
]);

function isWritableResource(resource: InventoryResource): resource is WritableInventoryResource {
  return writableResources.has(resource as WritableInventoryResource);
}

function sleep(milliseconds: number) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {
    // Intentional synchronous wait for the bootstrap file-backed store.
  }
}

function acquireLock() {
  mkdirSync(dirname(inventoryStateFilePath), { recursive: true });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      writeFileSync(inventoryStateLockPath, String(process.pid), { flag: "wx" });
      return;
    } catch {
      sleep(25);
    }
  }

  throw new Error("unable to acquire inventory state lock");
}

function releaseLock() {
  try {
    unlinkSync(inventoryStateLockPath);
  } catch {
    // lock cleanup should not block responses
  }
}

function loadInventoryState(): InventoryState {
  try {
    const parsed = JSON.parse(readFileSync(inventoryStateFilePath, "utf8")) as Partial<InventoryState>;
    return {
      sites: parsed.sites ?? defaultInventoryState.sites,
      racks: parsed.racks ?? defaultInventoryState.racks,
      devices: parsed.devices ?? defaultInventoryState.devices,
      prefixes: parsed.prefixes ?? defaultInventoryState.prefixes,
      ipAddresses: parsed.ipAddresses ?? defaultInventoryState.ipAddresses
    };
  } catch {
    return defaultInventoryState;
  }
}

function saveInventoryState(state: InventoryState) {
  mkdirSync(dirname(inventoryStateFilePath), { recursive: true });
  writeFileSync(inventoryStateFilePath, JSON.stringify(state, null, 2));
}

function withInventoryMutation<TResult>(callback: (state: InventoryState) => TResult): TResult {
  acquireLock();

  try {
    const state = loadInventoryState();
    const result = callback(state);

    if (typeof result === "object" && result && "nextState" in (result as Record<string, unknown>)) {
      saveInventoryState((result as unknown as { readonly nextState: InventoryState }).nextState);
    }

    return result;
  } finally {
    releaseLock();
  }
}

function createInventoryContext(): InventoryContext {
  return {
    tenants: referenceTenants,
    users: referenceUsers,
    vrfs: referenceVrfs,
    interfaces: referenceInterfaces,
    connections: referenceConnections,
    state: loadInventoryState()
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

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

function parseJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return readRequestBody(request).then((body) => {
    if (!body.trim()) {
      return {};
    }

    const parsed = JSON.parse(body) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("request body must be a JSON object");
    }

    return parsed as Record<string, unknown>;
  });
}

function sanitizeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createId(prefix: string, candidate?: string | null): string {
  const normalized = candidate ? sanitizeId(candidate) : "";
  return normalized ? normalized : `${prefix}-${Date.now()}`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return asString(value);
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

function sortRecords<TRecord>(
  records: readonly TRecord[],
  field: string,
  direction: "asc" | "desc"
): readonly TRecord[] {
  return [...records].sort((left, right) => {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const comparison = compareValues(leftRecord[field], rightRecord[field]);
    return direction === "asc" ? comparison : -comparison;
  });
}

function paginateRecords<TRecord>(
  records: readonly TRecord[],
  page: number,
  pageSize: number
): readonly TRecord[] {
  const offset = (page - 1) * pageSize;
  return records.slice(offset, offset + pageSize);
}

function toPageRequest(requestUrl: URL) {
  const page = Math.max(1, Number(requestUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get("pageSize") ?? "25")));
  const direction = requestUrl.searchParams.get("direction") === "desc" ? "desc" : "asc";

  return {
    page,
    pageSize,
    direction
  } as const;
}

function buildSiteDetail(context: InventoryContext, site: Site): ApiDetailResponse<Site> {
  const racks = context.state.racks.filter((rack) => rack.siteId === site.id);
  const devices = context.state.devices.filter((device) => device.siteId === site.id);

  return {
    resource: "sites",
    record: site,
    related: {
      tenant: context.tenants.find((tenant) => tenant.id === site.tenantId) ?? null,
      racks,
      devices
    }
  };
}

function buildRackDetail(context: InventoryContext, rack: Rack): ApiDetailResponse<Rack> {
  const devices = context.state.devices.filter((device) => device.rackPosition?.rackId === rack.id);

  return {
    resource: "racks",
    record: rack,
    related: {
      site: context.state.sites.find((site) => site.id === rack.siteId) ?? null,
      devices
    }
  };
}

function buildDeviceDetail(context: InventoryContext, device: Device): ApiDetailResponse<Device> {
  const interfaces = context.interfaces.filter((entry) => entry.deviceId === device.id);
  const ipAddresses = context.state.ipAddresses.filter((entry) =>
    interfaces.some((iface) => iface.id === entry.interfaceId)
  );
  const connections = context.connections.filter(
    (entry) => entry.fromDeviceId === device.id || entry.toDeviceId === device.id
  );

  return {
    resource: "devices",
    record: device,
    related: {
      site: context.state.sites.find((site) => site.id === device.siteId) ?? null,
      rack:
        device.rackPosition === null
          ? null
          : context.state.racks.find((rack) => rack.id === device.rackPosition?.rackId) ?? null,
      interfaces,
      ipAddresses,
      connections
    }
  };
}

function buildPrefixDetail(context: InventoryContext, prefix: Prefix): ApiDetailResponse<Prefix> {
  const children = context.state.prefixes.filter((entry) => entry.parentPrefixId === prefix.id);
  const ipAllocations = context.state.ipAddresses.filter((entry) => entry.prefixId === prefix.id);
  const hierarchy = buildPrefixHierarchy(
    context.state.prefixes.filter((entry) => entry.vrfId === prefix.vrfId)
  );
  const utilization = createPrefixUtilizationDirectory(context.state.prefixes, context.state.ipAddresses);

  return {
    resource: "prefixes",
    record: prefix,
    related: {
      vrf: context.vrfs.find((vrf) => vrf.id === prefix.vrfId) ?? null,
      parent: context.state.prefixes.find((entry) => entry.id === prefix.parentPrefixId) ?? null,
      children,
      ipAllocations,
      utilization: utilization.get(prefix.id) ?? null,
      hierarchyNode: hierarchy.nodes.get(prefix.id) ?? null
    }
  };
}

function buildIpAddressDetail(
  context: InventoryContext,
  ipAddress: IpAddress
): ApiDetailResponse<IpAddress> {
  const interfaceRecord = context.interfaces.find((entry) => entry.id === ipAddress.interfaceId) ?? null;
  const device =
    interfaceRecord === null
      ? null
      : context.state.devices.find((entry) => entry.id === interfaceRecord.deviceId) ?? null;

  return {
    resource: "ip-addresses",
    record: ipAddress,
    related: {
      prefix: context.state.prefixes.find((entry) => entry.id === ipAddress.prefixId) ?? null,
      vrf: context.vrfs.find((entry) => entry.id === ipAddress.vrfId) ?? null,
      interface: interfaceRecord,
      device
    }
  };
}

function listSites(context: InventoryContext, requestUrl: URL): ApiListResponse<Site> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const tenantId = requestUrl.searchParams.get("tenantId") ?? "";
  const sortField = requestUrl.searchParams.get("sort") ?? "name";
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const filtered = context.state.sites.filter((site) => {
    if (tenantId && site.tenantId !== tenantId) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [site.name, site.slug, site.id].some((value) => value.toLowerCase().includes(query));
  });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource: "sites",
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: tenantId ? { tenantId, query } : { query },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function listRacks(context: InventoryContext, requestUrl: URL): ApiListResponse<Record<string, unknown>> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const siteId = requestUrl.searchParams.get("siteId") ?? "";
  const sortField = requestUrl.searchParams.get("sort") ?? "name";
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const filtered = context.state.racks
    .map((rack) => ({
      ...rack,
      siteName: context.state.sites.find((site) => site.id === rack.siteId)?.name ?? "Unknown site",
      deviceCount: context.state.devices.filter((device) => device.rackPosition?.rackId === rack.id).length
    }))
    .filter((rack) => {
      if (siteId && rack.siteId !== siteId) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [rack.name, rack.id, String(rack.siteName)].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource: "racks",
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: siteId ? { siteId, query } : { query },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function listDevices(context: InventoryContext, requestUrl: URL): ApiListResponse<Record<string, unknown>> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const siteId = requestUrl.searchParams.get("siteId") ?? "";
  const role = requestUrl.searchParams.get("role") ?? "";
  const status = requestUrl.searchParams.get("status") ?? "";
  const sortField = requestUrl.searchParams.get("sort") ?? "name";
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const filtered = context.state.devices
    .map((device) => {
      const interfaces = context.interfaces.filter((entry) => entry.deviceId === device.id);
      return {
        ...device,
        siteName: context.state.sites.find((site) => site.id === device.siteId)?.name ?? "Unknown site",
        rackName:
          device.rackPosition === null
            ? null
            : context.state.racks.find((rack) => rack.id === device.rackPosition?.rackId)?.name ?? null,
        interfaceCount: interfaces.length,
        ipAddressCount: context.state.ipAddresses.filter((entry) =>
          entry.interfaceId && interfaces.some((iface) => iface.id === entry.interfaceId)
        ).length
      };
    })
    .filter((device) => {
      if (siteId && device.siteId !== siteId) {
        return false;
      }
      if (role && device.role !== role) {
        return false;
      }
      if (status && device.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [device.name, device.id, device.siteName, device.role].some((value) =>
        String(value).toLowerCase().includes(query)
      );
    });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource: "devices",
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: { query, siteId, role, status },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function listPrefixes(context: InventoryContext, requestUrl: URL): ApiListResponse<Record<string, unknown>> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const vrfId = requestUrl.searchParams.get("vrfId") ?? "";
  const status = requestUrl.searchParams.get("status") ?? "";
  const sortField = requestUrl.searchParams.get("sort") ?? "cidr";
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const utilization = createPrefixUtilizationDirectory(context.state.prefixes, context.state.ipAddresses);
  const filtered = context.state.prefixes
    .map((prefix) => ({
      ...prefix,
      vrfName: context.vrfs.find((vrf) => vrf.id === prefix.vrfId)?.name ?? "Global",
      childCount: context.state.prefixes.filter((entry) => entry.parentPrefixId === prefix.id).length,
      ipAddressCount: context.state.ipAddresses.filter((entry) => entry.prefixId === prefix.id).length,
      utilizationPercent: utilization.get(prefix.id)?.utilizationPercent ?? null
    }))
    .filter((prefix) => {
      if (vrfId && prefix.vrfId !== vrfId) {
        return false;
      }
      if (status && prefix.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [prefix.cidr, prefix.id, prefix.vrfName].some((value) =>
        String(value).toLowerCase().includes(query)
      );
    });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource: "prefixes",
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: { query, vrfId, status },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function listIpAddresses(context: InventoryContext, requestUrl: URL): ApiListResponse<Record<string, unknown>> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const prefixId = requestUrl.searchParams.get("prefixId") ?? "";
  const status = requestUrl.searchParams.get("status") ?? "";
  const sortField = requestUrl.searchParams.get("sort") ?? "address";
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const filtered = context.state.ipAddresses
    .map((ipAddress) => {
      const interfaceRecord = context.interfaces.find((entry) => entry.id === ipAddress.interfaceId) ?? null;
      const device =
        interfaceRecord === null
          ? null
          : context.state.devices.find((entry) => entry.id === interfaceRecord.deviceId) ?? null;

      return {
        ...ipAddress,
        prefixCidr: context.state.prefixes.find((entry) => entry.id === ipAddress.prefixId)?.cidr ?? null,
        deviceName: device?.name ?? null,
        interfaceName: interfaceRecord?.name ?? null
      };
    })
    .filter((ipAddress) => {
      if (prefixId && ipAddress.prefixId !== prefixId) {
        return false;
      }
      if (status && ipAddress.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [ipAddress.address, ipAddress.id, ipAddress.deviceName ?? "", ipAddress.interfaceName ?? ""].some(
        (value) => String(value).toLowerCase().includes(query)
      );
    });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource: "ip-addresses",
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: { query, prefixId, status },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function listReadOnlyResource<TRecord>(
  resource: InventoryResource,
  records: readonly TRecord[],
  requestUrl: URL,
  defaultSort = "id"
): ApiListResponse<TRecord> {
  const query = (requestUrl.searchParams.get("query") ?? "").trim().toLowerCase();
  const sortField = requestUrl.searchParams.get("sort") ?? defaultSort;
  const { page, pageSize, direction } = toPageRequest(requestUrl);
  const filtered = records.filter((record) => {
    if (!query) {
      return true;
    }

    return Object.values(record as Record<string, unknown>).some((value) =>
      String(value).toLowerCase().includes(query)
    );
  });
  const sorted = sortRecords(filtered, sortField, direction);

  return {
    resource,
    page,
    pageSize,
    total: sorted.length,
    sort: { field: sortField, direction },
    filters: { query },
    items: paginateRecords(sorted, page, pageSize)
  };
}

function getInventoryList(
  context: InventoryContext,
  resource: InventoryResource,
  requestUrl: URL
): ApiListResponse<InventoryRecordMap[InventoryResource] | Record<string, unknown>> {
  switch (resource) {
    case "sites":
      return listSites(context, requestUrl);
    case "racks":
      return listRacks(context, requestUrl);
    case "devices":
      return listDevices(context, requestUrl);
    case "prefixes":
      return listPrefixes(context, requestUrl);
    case "ip-addresses":
      return listIpAddresses(context, requestUrl);
    case "tenants":
      return listReadOnlyResource("tenants", context.tenants, requestUrl, "name");
    case "users":
      return listReadOnlyResource("users", context.users, requestUrl, "displayName");
    case "vrfs":
      return listReadOnlyResource("vrfs", context.vrfs, requestUrl, "name");
    case "interfaces":
      return listReadOnlyResource("interfaces", context.interfaces, requestUrl, "name");
    case "connections":
      return listReadOnlyResource("connections", context.connections, requestUrl, "label");
  }
}

function getInventoryDetail(
  context: InventoryContext,
  resource: InventoryResource,
  recordId: string
): ApiDetailResponse<unknown> | null {
  switch (resource) {
    case "sites": {
      const site = context.state.sites.find((entry) => entry.id === recordId);
      return site ? (buildSiteDetail(context, site) as unknown as ApiDetailResponse<unknown>) : null;
    }
    case "racks": {
      const rack = context.state.racks.find((entry) => entry.id === recordId);
      return rack ? (buildRackDetail(context, rack) as unknown as ApiDetailResponse<unknown>) : null;
    }
    case "devices": {
      const device = context.state.devices.find((entry) => entry.id === recordId);
      return device ? (buildDeviceDetail(context, device) as unknown as ApiDetailResponse<unknown>) : null;
    }
    case "prefixes": {
      const prefix = context.state.prefixes.find((entry) => entry.id === recordId);
      return prefix ? (buildPrefixDetail(context, prefix) as unknown as ApiDetailResponse<unknown>) : null;
    }
    case "ip-addresses": {
      const ipAddress = context.state.ipAddresses.find((entry) => entry.id === recordId);
      return ipAddress
        ? (buildIpAddressDetail(context, ipAddress) as unknown as ApiDetailResponse<unknown>)
        : null;
    }
    case "tenants": {
      const tenant = context.tenants.find((entry) => entry.id === recordId);
      return tenant ? { resource, record: tenant, related: {} } : null;
    }
    case "users": {
      const user = context.users.find((entry) => entry.id === recordId);
      return user ? { resource, record: user, related: {} } : null;
    }
    case "vrfs": {
      const vrf = context.vrfs.find((entry) => entry.id === recordId);
      return vrf
        ? {
            resource,
            record: vrf,
            related: {
              prefixes: context.state.prefixes.filter((entry) => entry.vrfId === vrf.id)
            }
          }
        : null;
    }
    case "interfaces": {
      const interfaceRecord = context.interfaces.find((entry) => entry.id === recordId);
      return interfaceRecord
        ? {
            resource,
            record: interfaceRecord,
            related: {
              device: context.state.devices.find((entry) => entry.id === interfaceRecord.deviceId) ?? null,
              ipAddresses: context.state.ipAddresses.filter((entry) =>
                interfaceRecord.ipAddressIds.includes(entry.id)
              ),
              connections: context.connections.filter(
                (entry) =>
                  entry.fromInterfaceId === interfaceRecord.id || entry.toInterfaceId === interfaceRecord.id
              )
            }
          }
        : null;
    }
    case "connections": {
      const connection = context.connections.find((entry) => entry.id === recordId);
      return connection ? { resource, record: connection, related: {} } : null;
    }
  }
}

function validateSitePayload(
  context: InventoryContext,
  payload: Record<string, unknown>,
  existingId?: string
): InventoryMutationResult<Site> {
  const errors: ValidationFailure[] = [];
  const name = asString(payload["name"]);
  const slug = asString(payload["slug"]);
  const tenantId = asNullableString(payload["tenantId"]);
  const id = createId("site", asNullableString(payload["id"]) ?? existingId ?? name);

  if (!name) {
    errors.push({ field: "name", message: "site name is required" });
  }
  if (!slug) {
    errors.push({ field: "slug", message: "site slug is required" });
  }
  if (tenantId && !context.tenants.some((entry) => entry.id === tenantId)) {
    errors.push({ field: "tenantId", message: "tenant must reference an existing tenant" });
  }
  if (context.state.sites.some((entry) => entry.id === id && entry.id !== existingId)) {
    errors.push({ field: "id", message: "site id must be unique" });
  }

  return {
    valid: errors.length === 0,
    errors,
    record: errors.length === 0 ? { id, slug: slug!, name: name!, tenantId } : null
  };
}

function validateRackPayload(
  context: InventoryContext,
  payload: Record<string, unknown>,
  existingId?: string
): InventoryMutationResult<Rack> {
  const errors: ValidationFailure[] = [];
  const name = asString(payload["name"]);
  const siteId = asString(payload["siteId"]);
  const totalUnits = asInteger(payload["totalUnits"]);
  const id = createId("rack", asNullableString(payload["id"]) ?? existingId ?? name);

  if (!name) {
    errors.push({ field: "name", message: "rack name is required" });
  }
  if (!siteId || !context.state.sites.some((entry) => entry.id === siteId)) {
    errors.push({ field: "siteId", message: "rack must reference an existing site" });
  }
  if (totalUnits === null || totalUnits < 1) {
    errors.push({ field: "totalUnits", message: "rack total units must be a positive integer" });
  }
  if (context.state.racks.some((entry) => entry.id === id && entry.id !== existingId)) {
    errors.push({ field: "id", message: "rack id must be unique" });
  }

  return {
    valid: errors.length === 0,
    errors,
    record: errors.length === 0 ? { id, siteId: siteId!, name: name!, totalUnits: totalUnits! } : null
  };
}

function validateDevicePayload(
  context: InventoryContext,
  payload: Record<string, unknown>,
  existingId?: string
): InventoryMutationResult<Device> {
  const errors: ValidationFailure[] = [];
  const allowedRoles: readonly DeviceRole[] = ["server", "switch", "router", "pdu", "appliance"];
  const allowedStatuses: readonly Device["status"][] = ["active", "planned", "offline", "decommissioned"];
  const name = asString(payload["name"]);
  const siteId = asString(payload["siteId"]);
  const role = asString(payload["role"]);
  const status = asString(payload["status"]);
  const rackId = asNullableString(payload["rackId"]);
  const rackFace = (asNullableString(payload["rackFace"]) ?? "front") as RackFace;
  const startUnit = asInteger(payload["startUnit"]);
  const heightUnits = asInteger(payload["heightUnits"]);
  const id = createId("device", asNullableString(payload["id"]) ?? existingId ?? name);

  if (!name) {
    errors.push({ field: "name", message: "device name is required" });
  }
  if (!siteId || !context.state.sites.some((entry) => entry.id === siteId)) {
    errors.push({ field: "siteId", message: "device must reference an existing site" });
  }
  if (!role || !allowedRoles.includes(role as DeviceRole)) {
    errors.push({ field: "role", message: `device role must be one of: ${allowedRoles.join(", ")}` });
  }
  if (!status || !allowedStatuses.includes(status as Device["status"])) {
    errors.push({
      field: "status",
      message: `device status must be one of: ${allowedStatuses.join(", ")}`
    });
  }

  let rackPosition: Device["rackPosition"] = null;

  if (rackId || startUnit !== null || heightUnits !== null) {
      const rack = context.state.racks.find((entry) => entry.id === rackId);

    if (!rack) {
      errors.push({ field: "rackId", message: "rack must reference an existing rack when placement is supplied" });
    } else if (startUnit === null || heightUnits === null) {
      errors.push({ field: "rackPosition", message: "rack placement requires start unit and height units" });
    } else {
        const candidate = {
        rackId: rack.id,
        face: rackFace,
        startingUnit: startUnit,
        heightUnits
      } satisfies NonNullable<Device["rackPosition"]>;
      const positionValidation = validateRackPosition(rack, candidate);
      const occupancyValidation = canOccupyRackPosition(
        rack,
        candidate,
        context.state.devices
          .filter((entry) => entry.id !== existingId && entry.rackPosition?.rackId === rack.id)
          .map((entry) => entry.rackPosition)
          .filter((entry): entry is NonNullable<Device["rackPosition"]> => entry !== null)
      );

      if (!positionValidation.valid) {
        errors.push({ field: "rackPosition", message: positionValidation.reason });
      } else if (!occupancyValidation.valid) {
        errors.push({ field: "rackPosition", message: occupancyValidation.reason });
      } else {
        rackPosition = candidate;
      }
    }
  }

  if (context.state.devices.some((entry) => entry.id === id && entry.id !== existingId)) {
    errors.push({ field: "id", message: "device id must be unique" });
  }

  return {
    valid: errors.length === 0,
    errors,
    record:
      errors.length === 0
        ? {
            id,
            siteId: siteId!,
            rackPosition,
            name: name!,
            role: role as DeviceRole,
            status: status as Device["status"]
          }
        : null
  };
}

function validatePrefixPayload(
  context: InventoryContext,
  payload: Record<string, unknown>,
  existingId?: string
): InventoryMutationResult<Prefix> {
  const errors: ValidationFailure[] = [];
  const cidr = asString(payload["cidr"]);
  const vrfId = asNullableString(payload["vrfId"]);
  const parentPrefixId = asNullableString(payload["parentPrefixId"]);
  const status = asString(payload["status"]);
  const tenantId = asNullableString(payload["tenantId"]);
  const allocationMode = asString(payload["allocationMode"]) ?? "pool";
  const family = asInteger(payload["family"]) === 6 || (cidr?.includes(":") ?? false) ? 6 : 4;
  const id = createId("prefix", asNullableString(payload["id"]) ?? existingId ?? cidr);

  if (!cidr) {
    errors.push({ field: "cidr", message: "prefix CIDR is required" });
  }
  if (vrfId && !context.vrfs.some((entry) => entry.id === vrfId)) {
    errors.push({ field: "vrfId", message: "prefix VRF must reference an existing VRF" });
  }
  if (status !== "active" && status !== "reserved" && status !== "deprecated") {
    errors.push({ field: "status", message: "prefix status must be active, reserved, or deprecated" });
  }
  if (allocationMode !== "hierarchical" && allocationMode !== "pool" && allocationMode !== "static") {
    errors.push({
      field: "allocationMode",
      message: "allocation mode must be hierarchical, pool, or static"
    });
  }
  if (tenantId && !context.tenants.some((entry) => entry.id === tenantId)) {
    errors.push({ field: "tenantId", message: "prefix tenant must reference an existing tenant" });
  }
  if (
    parentPrefixId &&
    !context.state.prefixes.some((entry) => entry.id === parentPrefixId && entry.id !== existingId)
  ) {
    errors.push({ field: "parentPrefixId", message: "parent prefix must reference an existing prefix" });
  }
  if (context.state.prefixes.some((entry) => entry.id === id && entry.id !== existingId)) {
    errors.push({ field: "id", message: "prefix id must be unique" });
  }

  const candidate: Prefix = {
    id,
    vrfId,
    parentPrefixId,
    cidr: cidr ?? "",
    family,
    status: (status ?? "active") as Prefix["status"],
    allocationMode: allocationMode as Prefix["allocationMode"],
    tenantId,
    vlanId: null
  };
  const shapeValidation = validatePrefix(candidate);

  if (!shapeValidation.valid) {
    errors.push({ field: "cidr", message: shapeValidation.reason });
  } else {
    const hierarchyValidation = validatePrefixHierarchy(
      context.state.prefixes.filter((entry) => entry.id !== existingId).concat(candidate)
    );

    if (!hierarchyValidation.valid) {
      errors.push({ field: "parentPrefixId", message: hierarchyValidation.reason });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    record: errors.length === 0 ? candidate : null
  };
}

function validateIpAddressPayload(
  context: InventoryContext,
  payload: Record<string, unknown>,
  existingId?: string
): InventoryMutationResult<IpAddress> {
  const errors: ValidationFailure[] = [];
  const address = asString(payload["address"]);
  const vrfId = asNullableString(payload["vrfId"]);
  const prefixId = asNullableString(payload["prefixId"]);
  const interfaceId = asNullableString(payload["interfaceId"]);
  const status = asString(payload["status"]);
  const role = asString(payload["role"]);
  const family = asInteger(payload["family"]) === 6 || (address?.includes(":") ?? false) ? 6 : 4;
  const id = createId("ip", asNullableString(payload["id"]) ?? existingId ?? address);

  if (!address) {
    errors.push({ field: "address", message: "IP address is required" });
  }
  if (vrfId && !context.vrfs.some((entry) => entry.id === vrfId)) {
    errors.push({ field: "vrfId", message: "IP VRF must reference an existing VRF" });
  }
  if (prefixId && !context.state.prefixes.some((entry) => entry.id === prefixId)) {
    errors.push({ field: "prefixId", message: "prefix must reference an existing prefix" });
  }
  if (interfaceId && !context.interfaces.some((entry) => entry.id === interfaceId)) {
    errors.push({ field: "interfaceId", message: "interface must reference an existing interface" });
  }
  if (status !== "active" && status !== "reserved" && status !== "deprecated") {
    errors.push({ field: "status", message: "IP status must be active, reserved, or deprecated" });
  }
  if (role !== "loopback" && role !== "primary" && role !== "secondary" && role !== "vip") {
    errors.push({ field: "role", message: "IP role must be loopback, primary, secondary, or vip" });
  }
  if (context.state.ipAddresses.some((entry) => entry.id === id && entry.id !== existingId)) {
    errors.push({ field: "id", message: "IP address id must be unique" });
  }

  const candidate: IpAddress = {
    id,
    vrfId,
    address: address ?? "",
    family,
    status: (status ?? "active") as IpAddress["status"],
    role: (role ?? "primary") as IpAddress["role"],
    prefixId,
    interfaceId
  };
  const shapeValidation = validateIpAddress(candidate);

  if (!shapeValidation.valid) {
    errors.push({ field: "address", message: shapeValidation.reason });
  }

  const prefix = prefixId ? context.state.prefixes.find((entry) => entry.id === prefixId) ?? null : null;
  if (prefix && prefix.vrfId !== candidate.vrfId) {
    errors.push({ field: "vrfId", message: "IP address must stay within the same VRF as its prefix" });
  }

  return {
    valid: errors.length === 0,
    errors,
    record: errors.length === 0 ? candidate : null
  };
}

function createMutationResponse(
  response: ServerResponse,
  statusCode: number,
  resource: WritableInventoryResource,
  result: InventoryMutationResult<unknown>,
  context: InventoryContext,
  recordId: string | null
) {
  if (!result.valid || !recordId) {
    sendJson(response, 400, {
      error: {
        code: "validation_failed",
        message: "request validation failed",
        fields: result.errors
      }
    });
    return;
  }

  const detail = getInventoryDetail(context, resource, recordId);
  sendJson(response, statusCode, detail);
}

async function handleCreateWritableResource(
  request: IncomingMessage,
  response: ServerResponse,
  resource: WritableInventoryResource
) {
  let payload: Record<string, unknown>;

  try {
    payload = await parseJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return;
  }

  const outcome = withInventoryMutation((state) => {
    const context: InventoryContext = {
      tenants: referenceTenants,
      users: referenceUsers,
      vrfs: referenceVrfs,
      interfaces: referenceInterfaces,
      connections: referenceConnections,
      state
    };

    const validation =
      resource === "sites"
        ? validateSitePayload(context, payload)
        : resource === "racks"
          ? validateRackPayload(context, payload)
          : resource === "devices"
            ? validateDevicePayload(context, payload)
            : resource === "prefixes"
              ? validatePrefixPayload(context, payload)
              : validateIpAddressPayload(context, payload);

    if (!validation.valid || !validation.record) {
      return { validation, nextState: state };
    }

    const nextState =
      resource === "sites"
        ? { ...state, sites: [...state.sites, validation.record as Site] }
        : resource === "racks"
          ? { ...state, racks: [...state.racks, validation.record as Rack] }
          : resource === "devices"
            ? { ...state, devices: [...state.devices, validation.record as Device] }
            : resource === "prefixes"
              ? { ...state, prefixes: [...state.prefixes, validation.record as Prefix] }
              : { ...state, ipAddresses: [...state.ipAddresses, validation.record as IpAddress] };

    return {
      validation,
      nextState
    };
  });

  const context = createInventoryContext();
  createMutationResponse(
    response,
    201,
    resource,
    outcome.validation,
    context,
    outcome.validation.record?.id ?? null
  );
}

async function handleUpdateWritableResource(
  request: IncomingMessage,
  response: ServerResponse,
  resource: WritableInventoryResource,
  recordId: string
) {
  let payload: Record<string, unknown>;

  try {
    payload = await parseJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: "invalid_json",
        message: error instanceof Error ? error.message : "request body must be valid JSON"
      }
    });
    return;
  }

  const outcome = withInventoryMutation((state) => {
    const context: InventoryContext = {
      tenants: referenceTenants,
      users: referenceUsers,
      vrfs: referenceVrfs,
      interfaces: referenceInterfaces,
      connections: referenceConnections,
      state
    };

    const existing =
      resource === "sites"
        ? state.sites.find((entry) => entry.id === recordId)
        : resource === "racks"
          ? state.racks.find((entry) => entry.id === recordId)
          : resource === "devices"
            ? state.devices.find((entry) => entry.id === recordId)
            : resource === "prefixes"
              ? state.prefixes.find((entry) => entry.id === recordId)
              : state.ipAddresses.find((entry) => entry.id === recordId);

    if (!existing) {
      return {
        notFound: true,
        validation: { valid: false, errors: [], record: null },
        nextState: state
      };
    }

    const mergedPayload = { ...existing, ...payload };
    const validation =
      resource === "sites"
        ? validateSitePayload(context, mergedPayload, recordId)
        : resource === "racks"
          ? validateRackPayload(context, mergedPayload, recordId)
          : resource === "devices"
            ? validateDevicePayload(context, mergedPayload, recordId)
            : resource === "prefixes"
              ? validatePrefixPayload(context, mergedPayload, recordId)
              : validateIpAddressPayload(context, mergedPayload, recordId);

    if (!validation.valid || !validation.record) {
      return { validation, nextState: state, notFound: false };
    }

    const nextState =
      resource === "sites"
        ? {
            ...state,
            sites: state.sites.map((entry) => (entry.id === recordId ? (validation.record as Site) : entry))
          }
        : resource === "racks"
          ? {
              ...state,
              racks: state.racks.map((entry) => (entry.id === recordId ? (validation.record as Rack) : entry))
            }
          : resource === "devices"
            ? {
                ...state,
                devices: state.devices.map((entry) => (entry.id === recordId ? (validation.record as Device) : entry))
              }
            : resource === "prefixes"
              ? {
                  ...state,
                  prefixes: state.prefixes.map((entry) => (entry.id === recordId ? (validation.record as Prefix) : entry))
                }
              : {
                  ...state,
                  ipAddresses: state.ipAddresses.map((entry) =>
                    entry.id === recordId ? (validation.record as IpAddress) : entry
                  )
                };

    return { validation, nextState, notFound: false };
  });

  if (outcome.notFound) {
    sendJson(response, 404, {
      error: {
        code: "not_found",
        message: `${resource} record ${recordId} was not found`
      }
    });
    return;
  }

  const context = createInventoryContext();
  createMutationResponse(
    response,
    200,
    resource,
    outcome.validation,
    context,
    outcome.validation.record?.id ?? null
  );
}

function deleteWritableResource(
  response: ServerResponse,
  resource: WritableInventoryResource,
  recordId: string
) {
  const outcome = withInventoryMutation((state) => {
    const context: InventoryContext = {
      tenants: referenceTenants,
      users: referenceUsers,
      vrfs: referenceVrfs,
      interfaces: referenceInterfaces,
      connections: referenceConnections,
      state
    };

    if (resource === "sites") {
      if (!state.sites.some((entry) => entry.id === recordId)) {
        return { notFound: true, nextState: state, blockingReason: null };
      }
      if (state.racks.some((entry) => entry.siteId === recordId) || state.devices.some((entry) => entry.siteId === recordId)) {
        return { notFound: false, nextState: state, blockingReason: "site has related racks or devices" };
      }
      return {
        notFound: false,
        blockingReason: null,
        nextState: { ...state, sites: state.sites.filter((entry) => entry.id !== recordId) }
      };
    }

    if (resource === "racks") {
      if (!state.racks.some((entry) => entry.id === recordId)) {
        return { notFound: true, nextState: state, blockingReason: null };
      }
      if (state.devices.some((entry) => entry.rackPosition?.rackId === recordId)) {
        return { notFound: false, nextState: state, blockingReason: "rack still contains devices" };
      }
      return {
        notFound: false,
        blockingReason: null,
        nextState: { ...state, racks: state.racks.filter((entry) => entry.id !== recordId) }
      };
    }

    if (resource === "devices") {
      if (!state.devices.some((entry) => entry.id === recordId)) {
        return { notFound: true, nextState: state, blockingReason: null };
      }
      if (
        context.interfaces.some((entry) => entry.deviceId === recordId) ||
        context.connections.some((entry) => entry.fromDeviceId === recordId || entry.toDeviceId === recordId)
      ) {
        return {
          notFound: false,
          nextState: state,
          blockingReason: "device has related interfaces or connections"
        };
      }
      return {
        notFound: false,
        blockingReason: null,
        nextState: { ...state, devices: state.devices.filter((entry) => entry.id !== recordId) }
      };
    }

    if (resource === "prefixes") {
      if (!state.prefixes.some((entry) => entry.id === recordId)) {
        return { notFound: true, nextState: state, blockingReason: null };
      }
      if (
        state.prefixes.some((entry) => entry.parentPrefixId === recordId) ||
        state.ipAddresses.some((entry) => entry.prefixId === recordId)
      ) {
        return {
          notFound: false,
          nextState: state,
          blockingReason: "prefix has child prefixes or IP allocations"
        };
      }
      return {
        notFound: false,
        blockingReason: null,
        nextState: { ...state, prefixes: state.prefixes.filter((entry) => entry.id !== recordId) }
      };
    }

    if (!state.ipAddresses.some((entry) => entry.id === recordId)) {
      return { notFound: true, nextState: state, blockingReason: null };
    }
    return {
      notFound: false,
      blockingReason: null,
      nextState: { ...state, ipAddresses: state.ipAddresses.filter((entry) => entry.id !== recordId) }
    };
  });

  if (outcome.notFound) {
    sendJson(response, 404, {
      error: {
        code: "not_found",
        message: `${resource} record ${recordId} was not found`
      }
    });
    return;
  }

  if (outcome.blockingReason) {
    sendJson(response, 409, {
      error: {
        code: "delete_blocked",
        message: outcome.blockingReason
      }
    });
    return;
  }

  sendJson(response, 200, {
    resource,
    deletedId: recordId
  });
}

function isInventoryResource(value: string): value is InventoryResource {
  return (
    value === "sites" ||
    value === "racks" ||
    value === "devices" ||
    value === "prefixes" ||
    value === "ip-addresses" ||
    value === "tenants" ||
    value === "users" ||
    value === "vrfs" ||
    value === "interfaces" ||
    value === "connections"
  );
}

function buildPhaseNavigationSummary(context: InventoryContext) {
  return {
    core: [
      { id: "tenants", label: "Tenants", count: context.tenants.length },
      { id: "users", label: "Users", count: context.users.length }
    ],
    dcim: [
      { id: "sites", label: "Sites", count: context.state.sites.length },
      { id: "racks", label: "Racks", count: context.state.racks.length },
      { id: "devices", label: "Devices", count: context.state.devices.length }
    ],
    ipam: [
      { id: "vrfs", label: "VRFs", count: context.vrfs.length },
      { id: "prefixes", label: "Prefixes", count: context.state.prefixes.length },
      { id: "ip-addresses", label: "IP Addresses", count: context.state.ipAddresses.length }
    ],
    network: [
      { id: "interfaces", label: "Interfaces", count: context.interfaces.length },
      { id: "connections", label: "Connections", count: context.connections.length }
    ],
    operations: [{ id: "jobs", label: "Jobs", count: null }]
  };
}

export async function handleInventoryApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/inventory")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/inventory/navigation") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      sections: buildPhaseNavigationSummary(createInventoryContext())
    });
    return true;
  }

  const detailMatch = requestUrl.pathname.match(/^\/api\/inventory\/([^/]+)\/([^/]+)$/);

  if (detailMatch) {
    const resource = detailMatch[1];
    const recordId = detailMatch[2];

    if (!isInventoryResource(resource)) {
      return false;
    }

    if (request.method === "GET") {
      const detail = getInventoryDetail(createInventoryContext(), resource, recordId);

      if (!detail) {
        sendJson(response, 404, {
          error: {
            code: "not_found",
            message: `${resource} record ${recordId} was not found`
          }
        });
        return true;
      }

      sendJson(response, 200, detail);
      return true;
    }

    if (request.method === "PUT") {
      if (!isWritableResource(resource)) {
        sendJson(response, 405, {
          error: {
            code: "method_not_allowed",
            message: `${resource} is read-only`
          }
        });
        return true;
      }

      await handleUpdateWritableResource(
        request,
        response,
        resource as WritableInventoryResource,
        recordId
      );
      return true;
    }

    if (request.method === "DELETE") {
      if (!isWritableResource(resource)) {
        sendJson(response, 405, {
          error: {
            code: "method_not_allowed",
            message: `${resource} is read-only`
          }
        });
        return true;
      }

      deleteWritableResource(response, resource as WritableInventoryResource, recordId);
      return true;
    }
  }

  const listMatch = requestUrl.pathname.match(/^\/api\/inventory\/([^/]+)$/);

  if (listMatch) {
    const resource = listMatch[1];

    if (!isInventoryResource(resource)) {
      return false;
    }

    if (request.method === "GET") {
      sendJson(response, 200, getInventoryList(createInventoryContext(), resource, requestUrl));
      return true;
    }

    if (request.method === "POST") {
      if (!isWritableResource(resource)) {
        sendJson(response, 405, {
          error: {
            code: "method_not_allowed",
            message: `${resource} is read-only`
          }
        });
        return true;
      }

      await handleCreateWritableResource(request, response, resource as WritableInventoryResource);
      return true;
    }
  }

  return false;
}

export type {
  ApiDetailResponse,
  ApiListResponse,
  ConnectionSummary,
  InventoryResource,
  UserSummary
};
