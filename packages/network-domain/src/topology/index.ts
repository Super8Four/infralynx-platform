export type TopologyEdgeKind = "l2-adjacency" | "l3-adjacency" | "vlan-propagation" | "cable-link";

export interface TopologyNode {
  readonly id: string;
  readonly domain: "dcim-interface" | "ip-address" | "prefix" | "vlan";
}

export interface TopologyEdge {
  readonly id: string;
  readonly kind: TopologyEdgeKind;
  readonly fromId: string;
  readonly toId: string;
  readonly metadata: Record<string, string>;
}

export interface TopologyValidationResult {
  readonly valid: boolean;
  readonly reason: string;
}

export function validateTopologyEdge(edge: TopologyEdge): TopologyValidationResult {
  if (edge.fromId === edge.toId) {
    return { valid: false, reason: "topology edges must connect distinct nodes" };
  }

  if (edge.metadata["bindingId"] === edge.id) {
    return { valid: false, reason: "topology edges must not reuse their own ID as a binding reference" };
  }

  return { valid: true, reason: "topology edge shape is valid" };
}

export function buildAdjacencyIndex(edges: readonly TopologyEdge[]) {
  const adjacency = new Map<string, TopologyEdge[]>();
  const orderedEdges = [...edges].sort((left, right) => {
    const leftKey = `${left.fromId}:${left.toId}:${left.kind}:${left.id}`;
    const rightKey = `${right.fromId}:${right.toId}:${right.kind}:${right.id}`;

    return leftKey.localeCompare(rightKey);
  });

  for (const edge of orderedEdges) {
    const current = adjacency.get(edge.fromId) ?? [];
    current.push(edge);
    adjacency.set(edge.fromId, current);
  }

  return adjacency;
}
