import test from "node:test";
import assert from "node:assert/strict";

import { workspaceMetadata } from "../../packages/config/dist/index.js";
import {
  createRoleIndex,
  createTenantDirectory,
  defaultCoreRoles,
  defaultTenantStatuses
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
  validateCableInterfaceBinding,
  validateInterfaceIpBinding,
  validateInterfaceVlanBinding,
  validatePrefixHierarchyBinding
} from "../../packages/network-domain/dist/index.js";
import { shellNavigation, workspacePanels } from "../../packages/ui/dist/index.js";
import {
  canAllocateChildPrefix,
  createVlanDirectory,
  isValidRouteDistinguisher,
  isValidVlanId,
  validateIpAddress,
  validatePrefix
} from "../../packages/ipam-domain/dist/index.js";
import { coreDomains, platformBoundaries } from "../../packages/domain-core/dist/index.js";
import { formatBanner } from "../../packages/shared/dist/index.js";

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
  assert.equal(shellNavigation.length >= 6, true);
  assert.equal(workspacePanels.some((panel) => panel.id === "dcim"), true);
  assert.equal(shellNavigation[0]?.label, "Overview");
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
