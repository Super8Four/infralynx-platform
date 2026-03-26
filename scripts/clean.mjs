import { rmSync } from "node:fs";

const paths = [
  "apps/api/dist",
  "apps/web/dist",
  "apps/worker/dist",
  "packages/config/dist",
  "packages/domain-core/dist",
  "packages/shared/dist"
];

for (const path of paths) {
  rmSync(path, { force: true, recursive: true });
}
