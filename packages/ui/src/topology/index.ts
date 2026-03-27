export type TopologyNodeTone = "network" | "compute" | "power" | "storage";

export type TopologyRenderedEdgeKind =
  | "cable-link"
  | "l2-adjacency"
  | "l3-adjacency"
  | "vlan-propagation";

export interface TopologyNodePosition {
  readonly x: number;
  readonly y: number;
}

export interface TopologyGraphNode {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly tone: TopologyNodeTone;
  readonly interfaceCount: number;
  readonly vlanIds: readonly string[];
  readonly position: TopologyNodePosition;
}

export interface TopologyGraphEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: TopologyRenderedEdgeKind;
  readonly label: string;
  readonly siteId: string;
  readonly vlanIds: readonly string[];
}

export interface TopologyGraphModel {
  readonly nodes: readonly TopologyGraphNode[];
  readonly edges: readonly TopologyGraphEdge[];
}

export interface TopologyFilterModel {
  readonly siteId: string | null;
  readonly role: string | null;
  readonly vlanId: string | null;
}

export function createDefaultTopologyFilter(): TopologyFilterModel {
  return {
    siteId: null,
    role: null,
    vlanId: null
  };
}

export function filterTopologyGraph(
  graph: TopologyGraphModel,
  filter: TopologyFilterModel
): TopologyGraphModel {
  const visibleNodes = graph.nodes.filter((node) => {
    if (filter.siteId && node.siteId !== filter.siteId) {
      return false;
    }

    if (filter.role && node.role !== filter.role) {
      return false;
    }

    if (filter.vlanId && !node.vlanIds.includes(filter.vlanId)) {
      return false;
    }

    return true;
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.fromNodeId) || !visibleNodeIds.has(edge.toNodeId)) {
      return false;
    }

    if (filter.siteId && edge.siteId !== filter.siteId) {
      return false;
    }

    if (filter.vlanId && !edge.vlanIds.includes(filter.vlanId)) {
      return false;
    }

    return true;
  });

  return {
    nodes: visibleNodes,
    edges: visibleEdges
  };
}

export function collectTopologyFilterOptions(graph: TopologyGraphModel) {
  const siteOptions = [...new Map(graph.nodes.map((node) => [node.siteId, node.siteName])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const roleOptions = [...new Set(graph.nodes.map((node) => node.role))].sort((left, right) =>
    left.localeCompare(right)
  );
  const vlanOptions = [...new Set(graph.nodes.flatMap((node) => node.vlanIds))].sort((left, right) =>
    left.localeCompare(right)
  );

  return {
    sites: siteOptions,
    roles: roleOptions,
    vlans: vlanOptions
  };
}

export function findTopologyNode(graph: TopologyGraphModel, nodeId: string | null) {
  if (!nodeId) {
    return null;
  }

  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

export function findConnectedEdges(graph: TopologyGraphModel, nodeId: string | null) {
  if (!nodeId) {
    return [];
  }

  return graph.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
}
