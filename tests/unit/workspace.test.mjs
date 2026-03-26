import test from "node:test";
import assert from "node:assert/strict";

import { workspaceMetadata } from "../../packages/config/dist/index.js";
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
