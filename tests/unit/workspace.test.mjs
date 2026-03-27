import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { workspaceMetadata } from "../../packages/config/dist/index.js";
import {
  createSearchQuery,
  createRoleIndex,
  createTenantDirectory,
  defaultCoreRoles,
  defaultTenantStatuses,
  groupSearchResults,
  searchRecords
} from "../../packages/core-domain/dist/index.js";
import { createSession, resolveAccessDecision } from "../../packages/auth/dist/index.js";
import { createAuditRecord, summarizeAuditRecord } from "../../packages/audit/dist/index.js";
import {
  canOccupyRackPosition,
  createRackDirectory,
  validateCable,
  validateRackPosition
} from "../../packages/dcim-domain/dist/index.js";
import {
  buildAdjacencyIndex,
  tracePath,
  validateTopologyEdge
} from "../../packages/network-domain/dist/index.js";
import {
  validateCableInterfaceBinding,
  validateInterfaceIpBinding,
  validateInterfaceVlanBinding,
  validatePrefixHierarchyBinding
} from "../../packages/network-domain/dist/index.js";
import {
  getNavigationBreadcrumbs,
  getNavigationGroups,
  getNavigationRoute,
  createInitialExpandedIpamTree,
  createIpamTreeModel,
  createDefaultTopologyFilter,
  createRackUnitSlots,
  flattenIpamTree,
  filterTopologyGraph,
  getDeviceCoverageLabel,
  shellNavigation,
  workspacePanels
} from "../../packages/ui/dist/index.js";
import {
  buildPrefixHierarchy,
  canAllocateChildPrefix,
  createPrefixUtilizationDirectory,
  createVlanDirectory,
  isValidRouteDistinguisher,
  isValidVlanId,
  validateIpAddress,
  validatePrefix,
  validatePrefixHierarchy
} from "../../packages/ipam-domain/dist/index.js";
import { coreDomains, platformBoundaries } from "../../packages/domain-core/dist/index.js";
import {
  createJobRecord,
  defaultJobRetryPolicy,
  markJobSucceeded,
  registerJobFailure
} from "../../packages/job-core/dist/index.js";
import {
  createFileBackedJobQueueStore,
  resetFileBackedJobQueueStore
} from "../../packages/job-queue/dist/index.js";
import {
  applyImport,
  executeImportJobPayload,
  exportDataset,
  validateImportInput
} from "../../packages/data-transfer/dist/index.js";
import {
  createFileBackedMediaRepository,
  createMediaLinks,
  createMediaRecord,
  resolveMediaAccess,
  validateMediaUpload
} from "../../packages/media-core/dist/index.js";
import { createLocalMediaStorage } from "../../packages/media-storage/dist/index.js";
import { formatBanner } from "../../packages/shared/dist/index.js";
import { createTopologyView } from "../../packages/network-domain/dist/index.js";

test("workspace metadata identifies the platform runtime", () => {
  assert.equal(workspaceMetadata.name, "InfraLynx Platform");
  assert.equal(workspaceMetadata.runtime, "node");
});

test("core domain contracts define mandatory platform areas", () => {
  assert.ok(coreDomains.includes("authentication"));
  assert.ok(coreDomains.includes("notifications"));
  assert.equal(platformBoundaries.api, "request/response orchestration and contract exposure");
});

test("shared utilities produce stable output", () => {
  assert.equal(
    formatBanner("InfraLynx Platform", "baseline"),
    "InfraLynx Platform :: baseline"
  );
});

test("core domain scaffolds expose tenant, status, and role indexes", () => {
  const tenants = createTenantDirectory([
    { id: "tenant-1", slug: "ops", name: "Operations", status: "active" }
  ]);
  const roles = createRoleIndex(defaultCoreRoles);

  assert.equal(defaultTenantStatuses.length, 3);
  assert.equal(tenants.get("tenant-1")?.name, "Operations");
  assert.equal(roles.get("core-platform-admin")?.slug, "platform-admin");
});

test("core search scaffolds rank, filter, and group results deterministically", () => {
  const records = [
    {
      id: "tenant-ops",
      domain: "core",
      kind: "tenant",
      title: "Operations",
      summary: "Operations tenant boundary",
      location: "Core / Tenants / operations",
      keywords: ["operations", "tenant"],
      tags: ["core"],
      status: "active"
    },
    {
      id: "prefix-prod",
      domain: "ipam",
      kind: "prefix",
      title: "10.40.16.0/24",
      summary: "Production application prefix",
      location: "IPAM / Prefixes / 10.40.16.0/24",
      keywords: ["production", "prefix", "apps"],
      tags: ["ipam"],
      status: "active"
    },
    {
      id: "device-leaf-sw1",
      domain: "dcim",
      kind: "device",
      title: "leaf-sw1",
      summary: "Top-of-rack switch in Dallas",
      location: "DCIM / Devices / leaf-sw1",
      keywords: ["leaf", "switch", "dallas"],
      tags: ["dcim"],
      status: "active"
    }
  ];
  const allMatches = searchRecords(records, createSearchQuery("operations"));
  const ipamMatches = searchRecords(records, createSearchQuery("production", "ipam"));
  const grouped = groupSearchResults(searchRecords(records, createSearchQuery("10.40")));

  assert.equal(allMatches[0]?.record.id, "tenant-ops");
  assert.equal(ipamMatches.length, 1);
  assert.equal(ipamMatches[0]?.record.domain, "ipam");
  assert.equal(grouped[0]?.domain, "ipam");
  assert.equal(grouped[0]?.results[0]?.record.id, "prefix-prod");
});

test("auth scaffolds resolve access from assigned roles", () => {
  const decision = resolveAccessDecision(
    {
      id: "identity-1",
      subject: "user@example.com",
      tenantId: "tenant-1",
      method: "password",
      roleIds: ["core-platform-admin"]
    },
    defaultCoreRoles,
    "tenant:write"
  );
  const session = createSession("identity-1", "2026-03-26T00:00:00.000Z", 30);

  assert.equal(decision.allowed, true);
  assert.match(session.expiresAt, /2026-03-26T00:30:00.000Z/);
});

test("audit scaffolds create append-only summaries", () => {
  const record = createAuditRecord({
    occurredAt: "2026-03-26T00:00:00.000Z",
    category: "authentication",
    action: "session.created",
    actor: {
      id: "identity-1",
      type: "user",
      tenantId: "tenant-1"
    },
    targetId: "session-1",
    metadata: { method: "password" }
  });

  assert.equal(record.id, "authentication:session.created:2026-03-26T00:00:00.000Z");
  assert.equal(
    summarizeAuditRecord(record),
    "2026-03-26T00:00:00.000Z authentication:session.created by user"
  );
});

test("ipam scaffolds validate basic VRF, prefix, IP, and VLAN rules", () => {
  const prefixValidation = validatePrefix({
    id: "prefix-1",
    vrfId: "vrf-1",
    parentPrefixId: null,
    cidr: "10.0.0.0/24",
    family: 4,
    status: "active",
    allocationMode: "hierarchical",
    tenantId: "tenant-1",
    vlanId: "vlan-1"
  });
  const addressValidation = validateIpAddress({
    id: "ip-1",
    vrfId: "vrf-1",
    address: "10.0.0.10/24",
    family: 4,
    status: "active",
    role: "primary",
    prefixId: "prefix-1",
    interfaceId: "interface-1"
  });
  const allocationDecision = canAllocateChildPrefix({
    parentPrefix: {
      id: "prefix-1",
      vrfId: "vrf-1",
      parentPrefixId: null,
      cidr: "10.0.0.0/24",
      family: 4,
      status: "active",
      allocationMode: "hierarchical",
      tenantId: "tenant-1",
      vlanId: null
    },
    childCidr: "10.0.0.0/28",
    childFamily: 4,
    childVrfId: "vrf-1"
  });
  const vlanDirectory = createVlanDirectory([
    {
      id: "vlan-1",
      vlanId: 120,
      name: "Servers",
      status: "active",
      tenantId: "tenant-1",
      interfaceIds: ["interface-1"]
    }
  ]);

  assert.equal(prefixValidation.valid, true);
  assert.equal(addressValidation.valid, true);
  assert.equal(allocationDecision.valid, true);
  assert.equal(vlanDirectory.get(120)?.name, "Servers");
  assert.equal(isValidVlanId(4094), true);
  assert.equal(isValidRouteDistinguisher("65000:10"), true);
});

test("ipam hierarchy scaffolds keep prefix nesting and utilization explicit", () => {
  const prefixes = [
    {
      id: "prefix-root",
      vrfId: "vrf-1",
      parentPrefixId: null,
      cidr: "10.0.0.0/24",
      family: 4,
      status: "active",
      allocationMode: "hierarchical",
      tenantId: "tenant-1",
      vlanId: null
    },
    {
      id: "prefix-child",
      vrfId: "vrf-1",
      parentPrefixId: "prefix-root",
      cidr: "10.0.0.0/26",
      family: 4,
      status: "active",
      allocationMode: "pool",
      tenantId: "tenant-1",
      vlanId: null
    }
  ];
  const addresses = [
    {
      id: "ip-1",
      vrfId: "vrf-1",
      address: "10.0.0.10/26",
      family: 4,
      status: "active",
      role: "primary",
      prefixId: "prefix-child",
      interfaceId: "interface-1"
    }
  ];
  const hierarchyValidation = validatePrefixHierarchy(prefixes);
  const hierarchy = buildPrefixHierarchy(prefixes);
  const utilization = createPrefixUtilizationDirectory(prefixes, addresses);
  const tree = createIpamTreeModel(
    [{ id: "vrf-1", name: "Global", rd: "65000:10" }],
    hierarchy,
    utilization,
    addresses.map((address) => ({ prefixId: address.prefixId }))
  );
  const rows = flattenIpamTree(tree, createInitialExpandedIpamTree(tree));

  assert.equal(hierarchyValidation.valid, true);
  assert.equal(hierarchy.roots[0], "prefix-root");
  assert.equal(hierarchy.nodes.get("prefix-root")?.childPrefixIds[0], "prefix-child");
  assert.equal(utilization.get("prefix-child")?.directIpCount, 1);
  assert.equal(rows.some((row) => row.id === "prefix-child"), true);
});

test("dcim scaffolds validate rack occupancy and cable endpoints", () => {
  const rack = {
    id: "rack-1",
    siteId: "site-1",
    name: "R1",
    totalUnits: 42
  };
  const rackValidation = validateRackPosition(rack, {
    rackId: "rack-1",
    face: "front",
    startingUnit: 10,
    heightUnits: 2
  });
  const occupancyDecision = canOccupyRackPosition(
    rack,
    {
      rackId: "rack-1",
      face: "front",
      startingUnit: 10,
      heightUnits: 2
    },
    [
      {
        rackId: "rack-1",
        face: "rear",
        startingUnit: 10,
        heightUnits: 2
      }
    ]
  );
  const cableValidation = validateCable({
    id: "cable-1",
    kind: "data",
    aSide: { deviceId: "device-1", interfaceId: "eth0" },
    zSide: { deviceId: "device-2", interfaceId: "eth1" },
    status: "connected"
  });
  const rackDirectory = createRackDirectory([rack]);

  assert.equal(rackValidation.valid, true);
  assert.equal(occupancyDecision.valid, true);
  assert.equal(cableValidation.valid, true);
  assert.equal(rackDirectory.get("rack-1")?.name, "R1");
});

test("ui scaffolds expose navigation and workspace panels", () => {
  assert.equal(shellNavigation.length >= 7, true);
  assert.equal(workspacePanels.some((panel) => panel.id === "dcim"), true);
  assert.equal(shellNavigation[0]?.label, "Tenants");
});

test("navigation scaffolds keep hierarchy and domain mapping explicit", () => {
  const groups = getNavigationGroups();
  const devices = getNavigationRoute("devices");
  const breadcrumbs = getNavigationBreadcrumbs("prefixes");

  assert.equal(groups.some((group) => group.id === "dcim"), true);
  assert.equal(devices.group, "dcim");
  assert.equal(devices.writable, true);
  assert.equal(breadcrumbs[0]?.label, "IPAM");
  assert.equal(breadcrumbs[1]?.label, "Prefixes");
});

test("rack system scaffolds create deterministic device slots", () => {
  const slots = createRackUnitSlots({
    id: "rack-a1",
    name: "A1",
    siteName: "Dallas One",
    totalUnits: 6,
    devices: [
      {
        id: "device-top",
        name: "leaf-sw1",
        role: "Top-of-rack switch",
        tone: "network",
        startUnit: 6,
        heightUnits: 2,
        ports: []
      },
      {
        id: "device-mid",
        name: "compute-01",
        role: "Application host",
        tone: "compute",
        startUnit: 3,
        heightUnits: 2,
        ports: []
      }
    ],
    cables: []
  });

  assert.equal(slots.length, 6);
  assert.equal(slots[0]?.occupant?.id, "device-top");
  assert.equal(slots[0]?.occupantStart, true);
  assert.equal(slots[1]?.occupant?.id, "device-top");
  assert.equal(getDeviceCoverageLabel(slots[0]?.occupant), "6U-5U");
  assert.equal(slots[3]?.occupant?.id, "device-mid");
});

test("cross-domain bindings stay explicit and ID-based", () => {
  const ipBinding = validateInterfaceIpBinding({
    id: "binding-ip-1",
    interfaceId: "interface-1",
    ipAddressId: "ip-1",
    vrfId: "vrf-1",
    prefixId: "prefix-1",
    role: "primary"
  });
  const vlanBinding = validateInterfaceVlanBinding({
    id: "binding-vlan-1",
    interfaceId: "interface-1",
    vlanId: "vlan-1",
    mode: "access",
    tagged: false
  });
  const cableBinding = validateCableInterfaceBinding({
    id: "binding-cable-1",
    cableId: "cable-1",
    aInterfaceId: "interface-1",
    zInterfaceId: "interface-2"
  });
  const hierarchyBinding = validatePrefixHierarchyBinding({
    id: "binding-prefix-1",
    vrfId: "vrf-1",
    parentPrefixId: "prefix-root",
    prefixId: "prefix-child"
  });

  assert.equal(ipBinding.valid, true);
  assert.equal(vlanBinding.valid, true);
  assert.equal(cableBinding.valid, true);
  assert.equal(hierarchyBinding.valid, true);
});

test("network topology and path tracing stay deterministic", () => {
  const l2Edge = validateTopologyEdge({
    id: "edge-l2-1",
    kind: "l2-adjacency",
    fromId: "interface-1",
    toId: "interface-2",
    metadata: { cableId: "cable-1" }
  });
  const edges = [
    {
      id: "edge-l2-1",
      kind: "l2-adjacency",
      fromId: "interface-1",
      toId: "interface-2",
      metadata: { cableId: "cable-1" }
    },
    {
      id: "edge-vlan-1",
      kind: "vlan-propagation",
      fromId: "interface-2",
      toId: "vlan-1",
      metadata: { mode: "access" }
    },
    {
      id: "edge-l3-1",
      kind: "l3-adjacency",
      fromId: "interface-2",
      toId: "ip-1",
      metadata: { bindingId: "binding-ip-1" }
    }
  ];
  const adjacency = buildAdjacencyIndex(edges);
  const path = tracePath(edges, {
    startNodeId: "interface-1",
    targetNodeId: "ip-1",
    allowedKinds: ["l2-adjacency", "l3-adjacency"],
    maxDepth: 4
  });

  assert.equal(l2Edge.valid, true);
  assert.equal(adjacency.get("interface-1")?.length, 1);
  assert.equal(path.found, true);
  assert.equal(path.path.length, 2);
  assert.equal(path.path[1]?.kind, "l3-adjacency");
});

test("topology view scaffolds keep layout and filtering deterministic", () => {
  const graph = createTopologyView(
    [
      {
        id: "device-leaf-sw1",
        name: "leaf-sw1",
        role: "Top-of-rack switch",
        tone: "network",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["leaf-sw1:xe-0/0/1"],
        vlanIds: ["vlan-120"]
      },
      {
        id: "device-server-01",
        name: "compute-01",
        role: "Application host",
        tone: "compute",
        siteId: "site-dal1",
        siteName: "Dallas One",
        interfaceIds: ["compute-01:eth0"],
        vlanIds: ["vlan-120"]
      },
      {
        id: "device-server-02",
        name: "compute-02",
        role: "Application host",
        tone: "compute",
        siteId: "site-phx1",
        siteName: "Phoenix One",
        interfaceIds: ["compute-02:eth0"],
        vlanIds: ["vlan-220"]
      }
    ],
    [
      {
        id: "edge-1",
        fromDeviceId: "device-leaf-sw1",
        toDeviceId: "device-server-01",
        kind: "cable-link",
        label: "access-a",
        vlanIds: ["vlan-120"]
      }
    ]
  );
  const filtered = filterTopologyGraph(graph, {
    ...createDefaultTopologyFilter(),
    siteId: "site-dal1",
    vlanId: "vlan-120"
  });
  const leafNode = graph.nodes.find((node) => node.id === "device-leaf-sw1");
  const dallasComputeNode = graph.nodes.find((node) => node.id === "device-server-01");

  assert.equal(leafNode?.label, "leaf-sw1");
  assert.equal(leafNode?.position.x, 160);
  assert.equal((dallasComputeNode?.position.y ?? 0) > (leafNode?.position.y ?? 0), true);
  assert.equal(filtered.nodes.length, 2);
  assert.equal(filtered.edges.length, 1);
  assert.equal(filtered.nodes.some((node) => node.siteId === "site-phx1"), false);
});

test("job scaffolds create lifecycle transitions and bounded retries", () => {
  const createdJob = createJobRecord({
    id: "job-1",
    type: "core.echo",
    payload: { message: "hello" },
    createdBy: "user-1",
    createdAt: "2026-03-27T13:00:00.000Z"
  });
  const succeededJob = markJobSucceeded(createdJob, { echoed: true }, "2026-03-27T13:01:00.000Z");
  const failedOnce = registerJobFailure(createdJob, "transient", defaultJobRetryPolicy, "2026-03-27T13:02:00.000Z");
  const failedFinal = registerJobFailure(
    { ...createdJob, retryCount: 2, status: "running" },
    "permanent",
    defaultJobRetryPolicy,
    "2026-03-27T13:03:00.000Z"
  );

  assert.equal(createdJob.status, "pending");
  assert.equal(succeededJob.status, "success");
  assert.equal(failedOnce.willRetry, true);
  assert.equal(failedOnce.job.status, "pending");
  assert.equal(failedFinal.willRetry, false);
  assert.equal(failedFinal.job.status, "failed");
});

test("job queue scaffolds lease, persist, and log worker activity deterministically", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "infralynx-jobs-"));
  const statePath = join(tempRoot, "queue.json");
  const queue = createFileBackedJobQueueStore(statePath);

  try {
    const queuedJob = queue.enqueue(
      createJobRecord({
        id: "job-queue-1",
        type: "core.echo",
        payload: { ok: true },
        createdBy: "user-1",
        createdAt: "2026-03-27T13:10:00.000Z"
      })
    );
    const leasedJob = queue.leaseNextPendingJob("2026-03-27T13:11:00.000Z");

    queue.appendLogs([
      {
        jobId: queuedJob.id,
        level: "info",
        message: "processed by worker",
        timestamp: "2026-03-27T13:12:00.000Z"
      }
    ]);

    assert.equal(queuedJob.status, "pending");
    assert.equal(leasedJob?.status, "running");
    assert.equal(queue.getJob(queuedJob.id)?.status, "running");
    assert.equal(queue.listLogs(queuedJob.id).length >= 2, true);
  } finally {
    resetFileBackedJobQueueStore(statePath);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("media scaffolds persist metadata, links, and local storage objects", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "infralynx-media-"));

  try {
    const repository = createFileBackedMediaRepository(join(tempRoot, "metadata.json"));
    const storage = createLocalMediaStorage(join(tempRoot, "objects"));
    const content = Buffer.from("rack-photo");
    const uploadValidation = validateMediaUpload({
      filename: "rack-a1.png",
      contentType: "image/png",
      size: content.byteLength,
      tenantId: "tenant-ops",
      createdBy: "user-1",
      associations: [{ objectType: "rack", objectId: "rack-a1" }]
    });
    const storedObject = storage.writeObject({
      mediaId: "media-1",
      tenantId: "tenant-ops",
      filename: "rack-a1.png",
      content
    });
    const record = createMediaRecord({
      id: "media-1",
      filename: "rack-a1.png",
      contentType: "image/png",
      size: content.byteLength,
      storagePath: storedObject.storagePath,
      tenantId: "tenant-ops",
      createdBy: "user-1",
      createdAt: "2026-03-27T12:00:00.000Z"
    });

    repository.saveMedia(record);
    repository.saveLinks(createMediaLinks(record.id, [{ objectType: "rack", objectId: "rack-a1" }]));

    assert.equal(uploadValidation.valid, true);
    assert.equal(repository.getMediaById("media-1")?.filename, "rack-a1.png");
    assert.equal(repository.listLinksByMediaId("media-1")[0]?.objectId, "rack-a1");
    assert.equal(repository.listMediaByObject("rack", "rack-a1", "tenant-ops").length, 1);
    assert.equal(Buffer.from(storage.readObject(storedObject.storagePath)).toString("utf8"), "rack-photo");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("media scaffolds enforce RBAC-aware access decisions", () => {
  const writerDecision = resolveMediaAccess(
    {
      id: "user-1",
      subject: "user-1",
      tenantId: "tenant-ops",
      method: "api-token",
      roleIds: ["core-platform-admin"]
    },
    "media:write"
  );
  const auditorDecision = resolveMediaAccess(
    {
      id: "auditor-1",
      subject: "auditor-1",
      tenantId: "tenant-ops",
      method: "api-token",
      roleIds: ["core-auditor"]
    },
    "media:write"
  );

  assert.equal(writerDecision.allowed, true);
  assert.equal(auditorDecision.allowed, false);
});

test("data transfer scaffolds validate, commit, and export transfer datasets", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "infralynx-transfer-"));
  const statePath = join(tempRoot, "state.json");

  try {
    const validation = validateImportInput({
      dataset: "tenants",
      format: "csv",
      csvContent: "id,slug,name,status\ntenant-apps,apps,Applications,active"
    });
    const committed = applyImport(statePath, {
      dataset: "tenants",
      format: "csv",
      csvContent: "id,slug,name,status\ntenant-apps,apps,Applications,active"
    });
    const exportedCsv = exportDataset(statePath, "tenants", "csv");
    const exportedApi = exportDataset(statePath, "tenants", "api");

    assert.equal(validation.valid, true);
    assert.equal(validation.recordCount, 1);
    assert.equal(committed.committed, true);
    assert.match(exportedCsv.body, /tenant-apps/);
    assert.match(exportedApi.body, /Applications/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("data transfer job payloads execute import summaries for worker processing", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "infralynx-transfer-job-"));
  const statePath = join(tempRoot, "state.json");

  try {
    const result = executeImportJobPayload({
      dataset: "sites",
      format: "api",
      dryRun: false,
      stateFilePath: statePath,
      records: [
        {
          id: "site-chi1",
          slug: "chi1",
          name: "Chicago One",
          tenantId: "tenant-ops"
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.equal(result.committed, true);
    assert.equal(result.recordCount, 1);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
