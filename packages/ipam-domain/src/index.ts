export type AddressFamily = 4 | 6;

export type AllocationMode = "hierarchical" | "pool" | "static";

export interface Vrf {
  readonly id: string;
  readonly name: string;
  readonly rd: string | null;
  readonly tenantId: string | null;
}

export interface Prefix {
  readonly id: string;
  readonly vrfId: string | null;
  readonly parentPrefixId: string | null;
  readonly cidr: string;
  readonly family: AddressFamily;
  readonly status: "active" | "reserved" | "deprecated";
  readonly allocationMode: AllocationMode;
  readonly tenantId: string | null;
  readonly vlanId: string | null;
}

export interface IpAddress {
  readonly id: string;
  readonly vrfId: string | null;
  readonly address: string;
  readonly family: AddressFamily;
  readonly status: "active" | "reserved" | "deprecated";
  readonly role: "loopback" | "primary" | "secondary" | "vip";
  readonly prefixId: string | null;
  readonly interfaceId: string | null;
}

export interface Vlan {
  readonly id: string;
  readonly vlanId: number;
  readonly name: string;
  readonly status: "active" | "reserved" | "deprecated";
  readonly tenantId: string | null;
  readonly interfaceIds: readonly string[];
}

export interface AllocationRequest {
  readonly parentPrefix: Prefix;
  readonly childCidr: string;
  readonly childFamily: AddressFamily;
  readonly childVrfId: string | null;
}

export interface PrefixHierarchyNode {
  readonly prefix: Prefix;
  readonly depth: number;
  readonly childPrefixIds: readonly string[];
}

export interface PrefixHierarchyTree {
  readonly roots: readonly string[];
  readonly nodes: ReadonlyMap<string, PrefixHierarchyNode>;
}

export interface PrefixUtilization {
  readonly prefixId: string;
  readonly totalAddresses: number | null;
  readonly usedAddresses: number | null;
  readonly availableAddresses: number | null;
  readonly utilizationPercent: number | null;
  readonly directIpCount: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason: string;
}

export const ipamStatusSet = ["active", "reserved", "deprecated"] as const;

export function isValidVlanId(vlanId: number): boolean {
  return Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094;
}

export function isValidRouteDistinguisher(rd: string | null): boolean {
  if (rd === null) {
    return true;
  }

  return /^[0-9]+:[0-9]+$/.test(rd);
}

export function parseCidr(cidr: string): { network: string; prefixLength: number } | null {
  const [network, prefixLength] = cidr.split("/");

  if (!network || prefixLength === undefined) {
    return null;
  }

  const parsedPrefixLength = Number(prefixLength);

  if (!Number.isInteger(parsedPrefixLength)) {
    return null;
  }

  return {
    network,
    prefixLength: parsedPrefixLength
  };
}

export function isValidPrefixLength(family: AddressFamily, prefixLength: number): boolean {
  if (!Number.isInteger(prefixLength)) {
    return false;
  }

  return family === 4
    ? prefixLength >= 0 && prefixLength <= 32
    : prefixLength >= 0 && prefixLength <= 128;
}

export function validatePrefix(prefix: Prefix): ValidationResult {
  const parsed = parseCidr(prefix.cidr);

  if (!parsed) {
    return { valid: false, reason: "cidr must use network/prefix-length format" };
  }

  if (!isValidPrefixLength(prefix.family, parsed.prefixLength)) {
    return { valid: false, reason: "prefix length is outside valid family bounds" };
  }

  return { valid: true, reason: "prefix shape is valid" };
}

export function validateIpAddress(ipAddress: IpAddress): ValidationResult {
  if (!ipAddress.address.includes("/")) {
    return { valid: false, reason: "ip address must include host prefix length" };
  }

  const parsed = parseCidr(ipAddress.address);

  if (!parsed || !isValidPrefixLength(ipAddress.family, parsed.prefixLength)) {
    return { valid: false, reason: "ip address prefix length is outside valid family bounds" };
  }

  return { valid: true, reason: "ip address shape is valid" };
}

export function canAllocateChildPrefix(request: AllocationRequest): ValidationResult {
  const parentCidr = parseCidr(request.parentPrefix.cidr);
  const childCidr = parseCidr(request.childCidr);

  if (!parentCidr || !childCidr) {
    return { valid: false, reason: "parent and child prefixes must both be valid CIDRs" };
  }

  if (request.parentPrefix.family !== request.childFamily) {
    return { valid: false, reason: "child prefix must stay within the same address family" };
  }

  if (request.parentPrefix.vrfId !== request.childVrfId) {
    return { valid: false, reason: "child prefix must stay within the same VRF" };
  }

  if (childCidr.prefixLength <= parentCidr.prefixLength) {
    return { valid: false, reason: "child prefix must be more specific than the parent prefix" };
  }

  if (request.parentPrefix.status !== "active") {
    return { valid: false, reason: "allocation can only occur from active parent prefixes" };
  }

  return { valid: true, reason: "child prefix request satisfies baseline allocation rules" };
}

export function createVlanDirectory(vlans: readonly Vlan[]) {
  return new Map(vlans.map((vlan) => [vlan.vlanId, vlan]));
}

function comparePrefixSpecificity(left: Prefix, right: Prefix): number {
  const leftParsed = parseCidr(left.cidr);
  const rightParsed = parseCidr(right.cidr);

  if (!leftParsed || !rightParsed) {
    return left.id.localeCompare(right.id);
  }

  if (leftParsed.prefixLength !== rightParsed.prefixLength) {
    return leftParsed.prefixLength - rightParsed.prefixLength;
  }

  return left.cidr.localeCompare(right.cidr) || left.id.localeCompare(right.id);
}

export function estimatePrefixCapacity(prefix: Prefix): number | null {
  const parsed = parseCidr(prefix.cidr);

  if (!parsed) {
    return null;
  }

  const width = prefix.family === 4 ? 32 : 128;
  const hostBits = width - parsed.prefixLength;

  if (hostBits < 0) {
    return null;
  }

  if (hostBits > 20) {
    return null;
  }

  return 2 ** hostBits;
}

export function validatePrefixHierarchy(prefixes: readonly Prefix[]): ValidationResult {
  const prefixDirectory = new Map(prefixes.map((prefix) => [prefix.id, prefix]));

  for (const prefix of prefixes) {
    if (!prefix.parentPrefixId) {
      continue;
    }

    const parent = prefixDirectory.get(prefix.parentPrefixId);

    if (!parent) {
      return { valid: false, reason: `parent prefix ${prefix.parentPrefixId} was not found` };
    }

    if (parent.vrfId !== prefix.vrfId) {
      return { valid: false, reason: `prefix ${prefix.id} must remain within the same VRF as its parent` };
    }

    const parentParsed = parseCidr(parent.cidr);
    const childParsed = parseCidr(prefix.cidr);

    if (!parentParsed || !childParsed) {
      return { valid: false, reason: "all prefixes in a hierarchy must have valid CIDRs" };
    }

    if (childParsed.prefixLength <= parentParsed.prefixLength) {
      return { valid: false, reason: `prefix ${prefix.id} must be more specific than its parent` };
    }

    const visited = new Set<string>([prefix.id]);
    let cursor: Prefix | undefined = parent;

    while (cursor?.parentPrefixId) {
      if (visited.has(cursor.id)) {
        return { valid: false, reason: `prefix hierarchy cycle detected at ${cursor.id}` };
      }

      visited.add(cursor.id);
      cursor = prefixDirectory.get(cursor.parentPrefixId);
    }
  }

  return { valid: true, reason: "prefix hierarchy relationships are valid" };
}

export function buildPrefixHierarchy(prefixes: readonly Prefix[]): PrefixHierarchyTree {
  const orderedPrefixes = [...prefixes].sort(comparePrefixSpecificity);
  const childDirectory = new Map<string, Prefix[]>();
  const rootPrefixes: Prefix[] = [];

  for (const prefix of orderedPrefixes) {
    if (!prefix.parentPrefixId) {
      rootPrefixes.push(prefix);
      continue;
    }

    const currentChildren = childDirectory.get(prefix.parentPrefixId) ?? [];
    currentChildren.push(prefix);
    currentChildren.sort(comparePrefixSpecificity);
    childDirectory.set(prefix.parentPrefixId, currentChildren);
  }

  const nodes = new Map<string, PrefixHierarchyNode>();
  const stack = rootPrefixes
    .slice()
    .reverse()
    .map((prefix) => ({ prefix, depth: 0 }));

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    const children = childDirectory.get(current.prefix.id) ?? [];
    nodes.set(current.prefix.id, {
      prefix: current.prefix,
      depth: current.depth,
      childPrefixIds: children.map((child) => child.id)
    });

    for (const child of [...children].reverse()) {
      stack.push({ prefix: child, depth: current.depth + 1 });
    }
  }

  return {
    roots: rootPrefixes.map((prefix) => prefix.id),
    nodes
  };
}

export function createPrefixUtilizationDirectory(
  prefixes: readonly Prefix[],
  ipAddresses: readonly IpAddress[]
): ReadonlyMap<string, PrefixUtilization> {
  const hierarchy = buildPrefixHierarchy(prefixes);
  const prefixDirectory = new Map(prefixes.map((prefix) => [prefix.id, prefix]));
  const addressesByPrefix = new Map<string, IpAddress[]>();

  for (const address of ipAddresses) {
    if (!address.prefixId) {
      continue;
    }

    const current = addressesByPrefix.get(address.prefixId) ?? [];
    current.push(address);
    addressesByPrefix.set(address.prefixId, current);
  }

  const orderedNodes = [...hierarchy.nodes.values()].sort((left, right) => right.depth - left.depth);
  const childConsumption = new Map<string, number | null>();
  const utilization = new Map<string, PrefixUtilization>();

  for (const node of orderedNodes) {
    const totalAddresses = estimatePrefixCapacity(node.prefix);
    const directIpCount = (addressesByPrefix.get(node.prefix.id) ?? []).length;
    const childUsed = node.childPrefixIds.reduce<number | null>((currentTotal, childId) => {
      const childPrefix = prefixDirectory.get(childId);
      const childCapacity = childPrefix ? estimatePrefixCapacity(childPrefix) : null;
      const childConsumed = childConsumption.get(childId) ?? childCapacity;

      if (currentTotal === null || childConsumed === null) {
        return null;
      }

      return currentTotal + childConsumed;
    }, 0);
    const usedAddresses =
      totalAddresses === null || childUsed === null ? null : Math.min(totalAddresses, childUsed + directIpCount);
    const availableAddresses =
      totalAddresses === null || usedAddresses === null ? null : Math.max(0, totalAddresses - usedAddresses);
    const utilizationPercent =
      totalAddresses === null || usedAddresses === null || totalAddresses === 0
        ? null
        : Number(((usedAddresses / totalAddresses) * 100).toFixed(1));

    childConsumption.set(node.prefix.id, usedAddresses);
    utilization.set(node.prefix.id, {
      prefixId: node.prefix.id,
      totalAddresses,
      usedAddresses,
      availableAddresses,
      utilizationPercent,
      directIpCount
    });
  }

  return utilization;
}
