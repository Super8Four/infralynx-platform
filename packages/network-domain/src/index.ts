export type InterfaceMode = "access" | "trunk" | "routed";

export interface InterfaceRef {
  readonly deviceId: string;
  readonly interfaceId: string;
}

export interface InterfaceIpBinding {
  readonly id: string;
  readonly interfaceId: string;
  readonly ipAddressId: string;
  readonly vrfId: string | null;
  readonly prefixId: string | null;
  readonly role: "primary" | "secondary" | "loopback" | "vip";
}

export interface InterfaceVlanBinding {
  readonly id: string;
  readonly interfaceId: string;
  readonly vlanId: string;
  readonly mode: InterfaceMode;
  readonly tagged: boolean;
}

export interface CableInterfaceBinding {
  readonly id: string;
  readonly cableId: string;
  readonly aInterfaceId: string;
  readonly zInterfaceId: string;
}

export interface PrefixHierarchyBinding {
  readonly id: string;
  readonly vrfId: string | null;
  readonly parentPrefixId: string | null;
  readonly prefixId: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason: string;
}

export function validateInterfaceIpBinding(binding: InterfaceIpBinding): ValidationResult {
  if (binding.prefixId === binding.ipAddressId) {
    return { valid: false, reason: "ip binding cannot reuse the IP address ID as a prefix ID" };
  }

  return { valid: true, reason: "interface to IP binding shape is valid" };
}

export function validateInterfaceVlanBinding(binding: InterfaceVlanBinding): ValidationResult {
  if (binding.mode === "access" && binding.tagged) {
    return { valid: false, reason: "access bindings must not be tagged" };
  }

  if (binding.mode === "trunk" && binding.tagged === false) {
    return { valid: false, reason: "trunk bindings must be explicitly tagged" };
  }

  return { valid: true, reason: "interface to VLAN binding shape is valid" };
}

export function validateCableInterfaceBinding(binding: CableInterfaceBinding): ValidationResult {
  if (binding.aInterfaceId === binding.zInterfaceId) {
    return { valid: false, reason: "cable binding must connect two distinct interfaces" };
  }

  return { valid: true, reason: "cable to interface binding shape is valid" };
}

export function validatePrefixHierarchyBinding(binding: PrefixHierarchyBinding): ValidationResult {
  if (binding.parentPrefixId === binding.prefixId) {
    return { valid: false, reason: "prefix hierarchy cannot self-reference" };
  }

  return { valid: true, reason: "prefix hierarchy shape is valid" };
}
