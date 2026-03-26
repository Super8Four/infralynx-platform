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
