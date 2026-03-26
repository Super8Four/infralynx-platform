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
