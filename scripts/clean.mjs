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
  "packages/dcim-domain/dist",
  "packages/dcim-domain/tsconfig.tsbuildinfo",
  "packages/domain-core/dist",
  "packages/domain-core/tsconfig.tsbuildinfo",
  "packages/ipam-domain/dist",
  "packages/ipam-domain/tsconfig.tsbuildinfo",
  "packages/media-core/dist",
  "packages/media-core/tsconfig.tsbuildinfo",
  "packages/media-storage/dist",
  "packages/media-storage/tsconfig.tsbuildinfo",
  "packages/network-domain/dist",
  "packages/network-domain/tsconfig.tsbuildinfo",
  "packages/ui/dist",
  "packages/ui/tsconfig.tsbuildinfo",
  "packages/shared/dist",
  "packages/shared/tsconfig.tsbuildinfo"
];

for (const path of paths) {
  try {
    rmSync(path, {
      force: true,
      recursive: true,
      maxRetries: 3,
      retryDelay: 100
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      // Windows can briefly hold generated files open; ignore transient cleanup locks.
      continue;
    }

    throw error;
  }
}
