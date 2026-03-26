import { workspaceMetadata } from "@infralynx/config";
import { platformBoundaries } from "@infralynx/domain-core";
export function describeApiSurface() {
    return `${workspaceMetadata.name} API boundary: ${platformBoundaries.api}`;
}
console.log(describeApiSurface());
//# sourceMappingURL=index.js.map