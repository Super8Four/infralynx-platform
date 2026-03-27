export type RackDeviceTone = "network" | "compute" | "power" | "storage";
export type RackPortStatus = "connected" | "available" | "disabled";

export interface RackPortModel {
  readonly id: string;
  readonly label: string;
  readonly side: "left" | "right";
  readonly status: RackPortStatus;
  readonly cableId: string | null;
  readonly peerPortLabel: string | null;
}

export interface RackDevicePlacementModel {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tone: RackDeviceTone;
  readonly startUnit: number;
  readonly heightUnits: number;
  readonly ports: readonly RackPortModel[];
}

export interface RackCableModel {
  readonly id: string;
  readonly fromDeviceId: string;
  readonly fromPortId: string;
  readonly fromPortLabel: string;
  readonly toDeviceId: string;
  readonly toPortId: string;
  readonly toPortLabel: string;
}

export interface RackModel {
  readonly id: string;
  readonly name: string;
  readonly siteName: string;
  readonly totalUnits: number;
  readonly devices: readonly RackDevicePlacementModel[];
  readonly cables: readonly RackCableModel[];
}

export interface RackUnitSlot {
  readonly unit: number;
  readonly occupant: RackDevicePlacementModel | null;
  readonly occupantStart: boolean;
}

export function sortRackDevicesByPosition(devices: readonly RackDevicePlacementModel[]) {
  return [...devices].sort((left, right) => {
    if (left.startUnit !== right.startUnit) {
      return right.startUnit - left.startUnit;
    }

    return left.name.localeCompare(right.name);
  });
}

export function createRackUnitSlots(rack: RackModel): readonly RackUnitSlot[] {
  const orderedDevices = sortRackDevicesByPosition(rack.devices);
  const slots: RackUnitSlot[] = [];

  for (let unit = rack.totalUnits; unit >= 1; unit -= 1) {
    const occupant =
      orderedDevices.find(
        (device) => unit <= device.startUnit && unit > device.startUnit - device.heightUnits
      ) ?? null;

    slots.push({
      unit,
      occupant,
      occupantStart: occupant !== null && unit === occupant.startUnit
    });
  }

  return slots;
}

export function getDeviceCoverageLabel(device: RackDevicePlacementModel): string {
  const topUnit = device.startUnit;
  const bottomUnit = device.startUnit - device.heightUnits + 1;

  return `${topUnit}U-${bottomUnit}U`;
}

export function countConnectedPorts(device: RackDevicePlacementModel): number {
  return device.ports.filter((port) => port.status === "connected").length;
}

export function findDevicePort(
  rack: RackModel,
  deviceId: string,
  portId: string
): RackPortModel | null {
  const device = rack.devices.find((candidate) => candidate.id === deviceId);

  return device?.ports.find((port) => port.id === portId) ?? null;
}
