import { buildAdjacencyIndex, type TopologyEdge, type TopologyEdgeKind } from "../topology/index.js";

export interface PathTraceStep {
  readonly edgeId: string;
  readonly kind: TopologyEdgeKind;
  readonly fromId: string;
  readonly toId: string;
}

export interface PathTraceResult {
  readonly found: boolean;
  readonly visitedNodeIds: readonly string[];
  readonly path: readonly PathTraceStep[];
  readonly reason: string;
}

export interface PathTraceRequest {
  readonly startNodeId: string;
  readonly targetNodeId: string;
  readonly allowedKinds: readonly TopologyEdgeKind[];
  readonly maxDepth: number;
}

function compareSteps(left: PathTraceStep, right: PathTraceStep) {
  const leftKey = `${left.fromId}:${left.toId}:${left.kind}:${left.edgeId}`;
  const rightKey = `${right.fromId}:${right.toId}:${right.kind}:${right.edgeId}`;

  return leftKey.localeCompare(rightKey);
}

export function tracePath(
  edges: readonly TopologyEdge[],
  request: PathTraceRequest
): PathTraceResult {
  const adjacency = buildAdjacencyIndex(edges);
  const queue: Array<{ nodeId: string; path: PathTraceStep[]; depth: number }> = [
    { nodeId: request.startNodeId, path: [], depth: 0 }
  ];
  const visitedNodeIds = new Set<string>([request.startNodeId]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    if (current.nodeId === request.targetNodeId) {
      return {
        found: true,
        visitedNodeIds: [...visitedNodeIds],
        path: current.path,
        reason: "target node reached"
      };
    }

    if (current.depth >= request.maxDepth) {
      continue;
    }

    const outbound = adjacency.get(current.nodeId) ?? [];

    for (const edge of [...outbound].sort((left, right) =>
      compareSteps(
        { edgeId: left.id, kind: left.kind, fromId: left.fromId, toId: left.toId },
        { edgeId: right.id, kind: right.kind, fromId: right.fromId, toId: right.toId }
      )
    )) {
      if (!request.allowedKinds.includes(edge.kind)) {
        continue;
      }

      if (visitedNodeIds.has(edge.toId)) {
        continue;
      }

      visitedNodeIds.add(edge.toId);
      queue.push({
        nodeId: edge.toId,
        depth: current.depth + 1,
        path: [
          ...current.path,
          {
            edgeId: edge.id,
            kind: edge.kind,
            fromId: edge.fromId,
            toId: edge.toId
          }
        ]
      });
    }
  }

  return {
    found: false,
    visitedNodeIds: [...visitedNodeIds],
    path: [],
    reason: "target node not reachable within depth and edge constraints"
  };
}
