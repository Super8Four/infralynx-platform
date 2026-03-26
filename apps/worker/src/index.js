import { workspaceMetadata } from "@infralynx/config";
import { platformBoundaries } from "@infralynx/domain-core";
export function describeWorkerRuntime() {
    return `${workspaceMetadata.name} worker boundary: ${platformBoundaries.worker}`;
}
console.log(describeWorkerRuntime());
//# sourceMappingURL=index.js.map