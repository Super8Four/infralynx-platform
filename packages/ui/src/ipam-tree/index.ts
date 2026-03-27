export interface IpamTreePrefixSource {
  readonly id: string;
  readonly vrfId: string | null;
  readonly cidr: string;
  readonly status: "active" | "reserved" | "deprecated";
  readonly allocationMode: "hierarchical" | "pool" | "static";
}

export interface IpamTreeHierarchyNode {
  readonly prefix: IpamTreePrefixSource;
  readonly depth: number;
  readonly childPrefixIds: readonly string[];
}

export interface IpamTreeHierarchy {
  readonly roots: readonly string[];
  readonly nodes: ReadonlyMap<string, IpamTreeHierarchyNode>;
}

export interface IpamTreeUtilization {
  readonly prefixId: string;
  readonly totalAddresses: number | null;
  readonly usedAddresses: number | null;
  readonly availableAddresses: number | null;
  readonly utilizationPercent: number | null;
  readonly directIpCount: number;
}

export interface IpamTreeVrfSource {
  readonly id: string;
  readonly name: string;
  readonly rd: string | null;
}

export interface IpamTreeAddressSource {
  readonly prefixId: string | null;
}

export interface IpamTreePrefixNode {
  readonly id: string;
  readonly prefixId: string;
  readonly vrfId: string | null;
  readonly label: string;
  readonly cidr: string;
  readonly status: IpamTreePrefixSource["status"];
  readonly allocationMode: IpamTreePrefixSource["allocationMode"];
  readonly depth: number;
  readonly childIds: readonly string[];
  readonly utilization: IpamTreeUtilization | null;
  readonly addressCount: number;
}

export interface IpamTreeVrfGroup {
  readonly id: string;
  readonly label: string;
  readonly rd: string | null;
  readonly rootNodeIds: readonly string[];
}

export interface IpamTreeModel {
  readonly vrfs: readonly IpamTreeVrfGroup[];
  readonly nodes: ReadonlyMap<string, IpamTreePrefixNode>;
}

export interface FlattenedIpamTreeRow {
  readonly id: string;
  readonly type: "vrf" | "prefix";
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly label: string;
  readonly prefixNode: IpamTreePrefixNode | null;
  readonly vrfGroup: IpamTreeVrfGroup | null;
}

export function createIpamTreeModel(
  vrfs: readonly IpamTreeVrfSource[],
  hierarchy: IpamTreeHierarchy,
  utilization: ReadonlyMap<string, IpamTreeUtilization>,
  ipAddresses: readonly IpamTreeAddressSource[]
): IpamTreeModel {
  const addressDirectory = new Map<string, number>();

  for (const address of ipAddresses) {
    if (!address.prefixId) {
      continue;
    }

    addressDirectory.set(address.prefixId, (addressDirectory.get(address.prefixId) ?? 0) + 1);
  }

  const nodes = new Map<string, IpamTreePrefixNode>();
  const vrfMap = new Map(vrfs.map((vrf) => [vrf.id, vrf]));
  const vrfRoots = new Map<string | null, string[]>();

  for (const rootId of hierarchy.roots) {
    const rootNode = hierarchy.nodes.get(rootId);

    if (!rootNode) {
      continue;
    }

    const currentRoots = vrfRoots.get(rootNode.prefix.vrfId) ?? [];
    currentRoots.push(rootId);
    vrfRoots.set(rootNode.prefix.vrfId, currentRoots);
  }

  for (const node of hierarchy.nodes.values()) {
    nodes.set(node.prefix.id, {
      id: node.prefix.id,
      prefixId: node.prefix.id,
      vrfId: node.prefix.vrfId,
      label: node.prefix.cidr,
      cidr: node.prefix.cidr,
      status: node.prefix.status,
      allocationMode: node.prefix.allocationMode,
      depth: node.depth,
      childIds: node.childPrefixIds,
      utilization: utilization.get(node.prefix.id) ?? null,
      addressCount: addressDirectory.get(node.prefix.id) ?? 0
    });
  }

  const groups: IpamTreeVrfGroup[] = [...vrfRoots.entries()]
    .map(([vrfId, rootNodeIds]) => {
      const vrf = vrfId ? vrfMap.get(vrfId) : null;

      return {
        id: vrfId ?? "vrf-unscoped",
        label: vrf?.name ?? "Unscoped",
        rd: vrf?.rd ?? null,
        rootNodeIds: [...rootNodeIds].sort((left, right) => left.localeCompare(right))
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    vrfs: groups,
    nodes
  };
}

export function createInitialExpandedIpamTree(model: IpamTreeModel): ReadonlySet<string> {
  return new Set(
    model.vrfs.flatMap((group) => [group.id, ...group.rootNodeIds])
  );
}

export function flattenIpamTree(model: IpamTreeModel, expandedIds: ReadonlySet<string>): readonly FlattenedIpamTreeRow[] {
  const rows: FlattenedIpamTreeRow[] = [];

  for (const group of model.vrfs) {
    const groupExpanded = expandedIds.has(group.id);
    rows.push({
      id: group.id,
      type: "vrf",
      depth: 0,
      expanded: groupExpanded,
      hasChildren: group.rootNodeIds.length > 0,
      label: group.label,
      prefixNode: null,
      vrfGroup: group
    });

    if (!groupExpanded) {
      continue;
    }

    const stack = [...group.rootNodeIds].reverse();

    while (stack.length > 0) {
      const nodeId = stack.pop();

      if (!nodeId) {
        continue;
      }

      const node = model.nodes.get(nodeId);

      if (!node) {
        continue;
      }

      const expanded = expandedIds.has(node.id);
      rows.push({
        id: node.id,
        type: "prefix",
        depth: node.depth + 1,
        expanded,
        hasChildren: node.childIds.length > 0,
        label: node.label,
        prefixNode: node,
        vrfGroup: group
      });

      if (expanded) {
        for (const childId of [...node.childIds].reverse()) {
          stack.push(childId);
        }
      }
    }
  }

  return rows;
}

export function formatUtilization(utilization: IpamTreeUtilization | null): string {
  if (!utilization || utilization.utilizationPercent === null) {
    return "capacity pending";
  }

  return `${utilization.utilizationPercent}% used`;
}
