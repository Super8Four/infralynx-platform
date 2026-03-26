export type DeviceRole = "server" | "switch" | "router" | "pdu" | "appliance";
export type RackFace = "front" | "rear";
export type InterfaceKind = "ethernet" | "fiber" | "management" | "console";
export type PowerFeedKind = "ac" | "dc";
export type CableKind = "data" | "power" | "console";

export interface Site {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tenantId: string | null;
}

export interface Rack {
  readonly id: string;
  readonly siteId: string;
  readonly name: string;
  readonly totalUnits: number;
}

export interface RackPosition {
  readonly rackId: string;
  readonly face: RackFace;
  readonly startingUnit: number;
  readonly heightUnits: number;
}

export interface Device {
  readonly id: string;
  readonly siteId: string;
  readonly rackPosition: RackPosition | null;
  readonly name: string;
  readonly role: DeviceRole;
  readonly status: "active" | "planned" | "offline" | "decommissioned";
}

export interface Interface {
  readonly id: string;
  readonly deviceId: string;
  readonly name: string;
  readonly kind: InterfaceKind;
  readonly enabled: boolean;
  readonly vlanIds: readonly string[];
  readonly ipAddressIds: readonly string[];
  readonly cableId: string | null;
}

export interface PowerPort {
  readonly id: string;
  readonly deviceId: string;
  readonly name: string;
  readonly feedKind: PowerFeedKind;
}

export interface CableEndpoint {
  readonly deviceId: string;
  readonly interfaceId: string;
}

export interface Cable {
  readonly id: string;
  readonly kind: CableKind;
  readonly aSide: CableEndpoint;
  readonly zSide: CableEndpoint;
  readonly status: "connected" | "planned" | "decommissioned";
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason: string;
}

export function isValidRackUnit(totalUnits: number, unit: number): boolean {
  return Number.isInteger(totalUnits) && totalUnits > 0 && Number.isInteger(unit) && unit >= 1 && unit <= totalUnits;
}

export function validateRackPosition(rack: Rack, position: RackPosition): ValidationResult {
  if (position.rackId !== rack.id) {
    return { valid: false, reason: "rack position must reference the same rack" };
  }

  if (!isValidRackUnit(rack.totalUnits, position.startingUnit)) {
    return { valid: false, reason: "starting rack unit is outside rack bounds" };
  }

  if (!Number.isInteger(position.heightUnits) || position.heightUnits < 1) {
    return { valid: false, reason: "device height must be at least 1U" };
  }

  const endingUnit = position.startingUnit + position.heightUnits - 1;

  if (!isValidRackUnit(rack.totalUnits, endingUnit)) {
    return { valid: false, reason: "device height extends beyond rack capacity" };
  }

  return { valid: true, reason: "rack position is valid" };
}

export function canOccupyRackPosition(
  rack: Rack,
  candidate: RackPosition,
  occupied: readonly RackPosition[]
): ValidationResult {
  const positionValidation = validateRackPosition(rack, candidate);

  if (!positionValidation.valid) {
    return positionValidation;
  }

  for (const position of occupied) {
    const sameRack = position.rackId === candidate.rackId;
    const sameFace = position.face === candidate.face;
    const overlaps =
      candidate.startingUnit <= position.startingUnit + position.heightUnits - 1 &&
      position.startingUnit <= candidate.startingUnit + candidate.heightUnits - 1;

    if (sameRack && sameFace && overlaps) {
      return { valid: false, reason: "rack position overlaps an existing device on the same face" };
    }
  }

  return { valid: true, reason: "rack position does not overlap existing devices" };
}

export function validateCable(cable: Cable): ValidationResult {
  if (
    cable.aSide.deviceId === cable.zSide.deviceId &&
    cable.aSide.interfaceId === cable.zSide.interfaceId
  ) {
    return { valid: false, reason: "cable endpoints must not reference the same interface" };
  }

  return { valid: true, reason: "cable endpoints are distinct" };
}

export function createRackDirectory(racks: readonly Rack[]) {
  return new Map(racks.map((rack) => [rack.id, rack]));
}
