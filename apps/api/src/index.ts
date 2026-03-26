import { workspaceMetadata } from "@infralynx/config";
import { platformBoundaries } from "@infralynx/domain-core";

export function describeApiSurface(): string {
  return `${workspaceMetadata.name} API boundary: ${platformBoundaries.api}`;
}

console.log(describeApiSurface());
