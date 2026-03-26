import { workspaceMetadata } from "../../../packages/config/dist/index.js";
import { platformBoundaries } from "../../../packages/domain-core/dist/index.js";

export function describeApiSurface(): string {
  return `${workspaceMetadata.name} API boundary: ${platformBoundaries.api}`;
}

console.log(describeApiSurface());
