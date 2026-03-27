import type { TopologyEdgeKind } from "../topology/index.js";

export interface TopologyViewDevice {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tone: "network" | "compute" | "power" | "storage";
  readonly siteId: string;
  readonly siteName: string;
  readonly interfaceIds: readonly string[];
  readonly vlanIds: readonly string[];
}

export interface TopologyViewCable {
  readonly id: string;
  readonly fromDeviceId: string;
  readonly toDeviceId: string;
  readonly kind: Extract<TopologyEdgeKind, "cable-link" | "l2-adjacency" | "l3-adjacency" | "vlan-propagation">;
  readonly label: string;
  readonly vlanIds: readonly string[];
}

export interface TopologyViewNode {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly tone: "network" | "compute" | "power" | "storage";
  readonly interfaceCount: number;
  readonly vlanIds: readonly string[];
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface TopologyViewEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: TopologyViewCable["kind"];
  readonly label: string;
  readonly siteId: string;
  readonly vlanIds: readonly string[];
}

export interface TopologyViewGraph {
  readonly nodes: readonly TopologyViewNode[];
  readonly edges: readonly TopologyViewEdge[];
}

export interface TopologyViewLayoutOptions {
  readonly columnWidth: number;
  readonly rowHeight: number;
  readonly siteOffsetX: number;
  readonly roleBands: readonly string[];
}

const defaultLayoutOptions: TopologyViewLayoutOptions = {
  columnWidth: 220,
  rowHeight: 130,
  siteOffsetX: 520,
  roleBands: ["Spine", "Top-of-rack switch", "Aggregation", "Application host", "Storage host", "Power distribution"]
};

function getRoleBandIndex(roleBands: readonly string[], role: string): number {
  const index = roleBands.findIndex((band) => band === role);

  return index >= 0 ? index : roleBands.length;
}

function toStableDeviceOrder(devices: readonly TopologyViewDevice[]) {
  return [...devices].sort((left, right) => {
    const siteComparison = left.siteName.localeCompare(right.siteName);

    if (siteComparison !== 0) {
      return siteComparison;
    }

    const roleComparison = left.role.localeCompare(right.role);

    if (roleComparison !== 0) {
      return roleComparison;
    }

    const nameComparison = left.name.localeCompare(right.name);

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

export function createTopologyView(
  devices: readonly TopologyViewDevice[],
  cables: readonly TopologyViewCable[],
  options: Partial<TopologyViewLayoutOptions> = {}
): TopologyViewGraph {
  const layout = { ...defaultLayoutOptions, ...options };
  const orderedDevices = toStableDeviceOrder(devices);
  const siteOrder = [...new Set(orderedDevices.map((device) => device.siteId))];
  const siteColumns = new Map<string, number>();

  for (const [index, siteId] of siteOrder.entries()) {
    siteColumns.set(siteId, index);
  }

  const nodes = orderedDevices.map((device, index) => {
    const siteColumn = siteColumns.get(device.siteId) ?? 0;
    const bandIndex = getRoleBandIndex(layout.roleBands, device.role);
    const peerOffset = orderedDevices
      .slice(0, index)
      .filter((candidate) => candidate.siteId === device.siteId && candidate.role === device.role).length;

    return {
      id: device.id,
      label: device.name,
      role: device.role,
      siteId: device.siteId,
      siteName: device.siteName,
      tone: device.tone,
      interfaceCount: device.interfaceIds.length,
      vlanIds: [...device.vlanIds].sort((left, right) => left.localeCompare(right)),
      position: {
        x: 160 + siteColumn * layout.siteOffsetX + peerOffset * layout.columnWidth,
        y: 120 + bandIndex * layout.rowHeight
      }
    } satisfies TopologyViewNode;
  });
  const nodeDirectory = new Map(nodes.map((node) => [node.id, node]));
  const edges = [...cables]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((cable) => {
      const fromNode = nodeDirectory.get(cable.fromDeviceId);
      const toNode = nodeDirectory.get(cable.toDeviceId);

      if (!fromNode || !toNode) {
        return [];
      }

      return [
        {
          id: cable.id,
          fromNodeId: cable.fromDeviceId,
          toNodeId: cable.toDeviceId,
          kind: cable.kind,
          label: cable.label,
          siteId: fromNode.siteId === toNode.siteId ? fromNode.siteId : `${fromNode.siteId}:${toNode.siteId}`,
          vlanIds: [...new Set(cable.vlanIds)].sort((left, right) => left.localeCompare(right))
        } satisfies TopologyViewEdge
      ];
    });

  return {
    nodes,
    edges
  };
}
