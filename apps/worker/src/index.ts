import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import { platformBoundaries } from "../../../packages/domain-core/dist/index.js";

export function describeWorkerRuntime(): string {
  return `${workspaceMetadata.name} worker boundary: ${platformBoundaries.worker}`;
}

console.log(describeWorkerRuntime());
