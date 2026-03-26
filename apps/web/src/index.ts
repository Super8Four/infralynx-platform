import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import { coreDomains } from "../../../packages/domain-core/dist/index.js";
import { formatBanner } from "../../../packages/shared/dist/index.js";

export function bootstrapWebApp(): string {
  return formatBanner(
    `${workspaceMetadata.name}: web shell`,
    `Domains: ${coreDomains.join(", ")}`
  );
}

console.log(bootstrapWebApp());
