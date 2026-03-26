import { rmSync } from "node:fs";

const paths = [
  "apps/api/dist",
  "apps/api/tsconfig.tsbuildinfo",
  "apps/web/dist",
  "apps/web/tsconfig.tsbuildinfo",
  "apps/worker/dist",
  "apps/worker/tsconfig.tsbuildinfo",
  "packages/config/dist",
  "packages/config/tsconfig.tsbuildinfo",
  "packages/core-domain/dist",
  "packages/core-domain/tsconfig.tsbuildinfo",
  "packages/auth/dist",
  "packages/auth/tsconfig.tsbuildinfo",
  "packages/audit/dist",
  "packages/audit/tsconfig.tsbuildinfo",
  "packages/db-abstraction/dist",
  "packages/db-abstraction/tsconfig.tsbuildinfo",
  "packages/domain-core/dist",
  "packages/domain-core/tsconfig.tsbuildinfo",
  "packages/shared/dist",
  "packages/shared/tsconfig.tsbuildinfo"
];

for (const path of paths) {
  rmSync(path, { force: true, recursive: true });
}
