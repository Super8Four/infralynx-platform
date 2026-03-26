import { workspaceMetadata } from "@infralynx/config";
import { coreDomains } from "@infralynx/domain-core";
import { formatBanner } from "@infralynx/shared";
export function bootstrapWebApp() {
    return formatBanner(`${workspaceMetadata.name}: web shell`, `Domains: ${coreDomains.join(", ")}`);
}
console.log(bootstrapWebApp());
//# sourceMappingURL=index.js.map