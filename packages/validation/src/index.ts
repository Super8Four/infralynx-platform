export type ValidationResource =
  | "site"
  | "rack"
  | "device"
  | "interface"
  | "connection"
  | "prefix"
  | "ip-address"
  | "vrf";

export interface ValidationConflict {
  readonly code: string;
  readonly message: string;
  readonly resource: ValidationResource;
  readonly recordId: string | null;
  readonly field?: string;
  readonly relatedResource?: ValidationResource;
  readonly relatedRecordId?: string | null;
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly resource?: ValidationResource;
  readonly recordId?: string | null;
}

export interface ValidationTenantLike {
  readonly id: string;
}

export interface ValidationVrfLike {
  readonly id: string;
  readonly tenantId?: string | null;
}

export interface ValidationSiteLike {
  readonly id: string;
  readonly tenantId?: string | null;
}

export interface ValidationRackLike {
  readonly id: string;
  readonly siteId: string;
  readonly totalUnits: number;
}

export interface ValidationDeviceLike {
  readonly id: string;
  readonly siteId: string;
  readonly rackPosition?: {
    readonly rackId: string;
    readonly face: "front" | "rear";
    readonly startingUnit: number;
    readonly heightUnits: number;
  } | null;
}

export interface ValidationInterfaceLike {
  readonly id: string;
  readonly deviceId: string;
}

export interface ValidationConnectionLike {
  readonly id: string;
  readonly fromDeviceId: string;
  readonly fromInterfaceId: string;
  readonly toDeviceId: string;
  readonly toInterfaceId: string;
}

export interface ValidationPrefixLike {
  readonly id: string;
  readonly vrfId?: string | null;
  readonly parentPrefixId?: string | null;
  readonly cidr: string;
  readonly family: 4 | 6;
  readonly tenantId?: string | null;
}

export interface ValidationIpAddressLike {
  readonly id: string;
  readonly vrfId?: string | null;
  readonly address: string;
  readonly family: 4 | 6;
  readonly prefixId?: string | null;
  readonly interfaceId?: string | null;
}

export interface ValidationInventorySnapshot {
  readonly tenants: readonly ValidationTenantLike[];
  readonly vrfs: readonly ValidationVrfLike[];
  readonly sites: readonly ValidationSiteLike[];
  readonly racks: readonly ValidationRackLike[];
  readonly devices: readonly ValidationDeviceLike[];
  readonly interfaces: readonly ValidationInterfaceLike[];
  readonly connections: readonly ValidationConnectionLike[];
  readonly prefixes: readonly ValidationPrefixLike[];
  readonly ipAddresses: readonly ValidationIpAddressLike[];
}

export interface ValidationSummary {
  readonly valid: boolean;
  readonly conflicts: readonly ValidationConflict[];
  readonly warnings: readonly ValidationWarning[];
}

interface ParsedIpv4Range {
  readonly address: string;
  readonly network: number;
  readonly prefixLength: number;
  readonly start: number;
  readonly end: number;
  readonly host: number;
}

function createConflict(input: ValidationConflict): ValidationConflict {
  return input;
}

function createWarning(input: ValidationWarning): ValidationWarning {
  return input;
}

function parseIpv4Octet(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return parsed >= 0 && parsed <= 255 ? parsed : null;
}

function parseIpv4Number(address: string): number | null {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map(parseIpv4Octet);

  if (octets.some((octet) => octet === null)) {
    return null;
  }

  return (
    ((octets[0] as number) << 24) >>> 0 |
    ((octets[1] as number) << 16) |
    ((octets[2] as number) << 8) |
    (octets[3] as number)
  ) >>> 0;
}

function parseIpv4Range(value: string): ParsedIpv4Range | null {
  const [address, prefixText] = value.split("/");

  if (!address || !prefixText) {
    return null;
  }

  const prefixLength = Number(prefixText);

  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    return null;
  }

  const host = parseIpv4Number(address);

  if (host === null) {
    return null;
  }

  const mask = prefixLength === 0 ? 0 : ((0xffffffff << (32 - prefixLength)) >>> 0);
  const network = host & mask;
  const hostMask = (~mask) >>> 0;

  return {
    address,
    network,
    prefixLength,
    start: network >>> 0,
    end: (network | hostMask) >>> 0,
    host
  };
}

function rangesOverlap(left: ParsedIpv4Range, right: ParsedIpv4Range) {
  return left.start <= right.end && right.start <= left.end;
}

function rangeContains(outer: ParsedIpv4Range, inner: ParsedIpv4Range) {
  return outer.start <= inner.start && outer.end >= inner.end;
}

function isDeclaredParent(
  parent: ValidationPrefixLike,
  child: ValidationPrefixLike
) {
  return child.parentPrefixId === parent.id;
}

function isContainedByDeclaredRelationship(
  left: ValidationPrefixLike,
  right: ValidationPrefixLike,
  leftRange: ParsedIpv4Range,
  rightRange: ParsedIpv4Range
) {
  return (
    (isDeclaredParent(left, right) && rangeContains(leftRange, rightRange)) ||
    (isDeclaredParent(right, left) && rangeContains(rightRange, leftRange))
  );
}

export function validateInventorySnapshot(snapshot: ValidationInventorySnapshot): ValidationSummary {
  const conflicts: ValidationConflict[] = [];
  const warnings: ValidationWarning[] = [];

  const tenantIndex = new Map(snapshot.tenants.map((tenant) => [tenant.id, tenant]));
  const vrfIndex = new Map(snapshot.vrfs.map((vrf) => [vrf.id, vrf]));
  const siteIndex = new Map(snapshot.sites.map((site) => [site.id, site]));
  const rackIndex = new Map(snapshot.racks.map((rack) => [rack.id, rack]));
  const deviceIndex = new Map(snapshot.devices.map((device) => [device.id, device]));
  const interfaceIndex = new Map(snapshot.interfaces.map((entry) => [entry.id, entry]));
  const prefixIndex = new Map(snapshot.prefixes.map((prefix) => [prefix.id, prefix]));

  for (const site of snapshot.sites) {
    if (site.tenantId && !tenantIndex.has(site.tenantId)) {
      conflicts.push(
        createConflict({
          code: "site_missing_tenant",
          message: `Site ${site.id} references tenant ${site.tenantId}, which does not exist.`,
          resource: "site",
          recordId: site.id,
          field: "tenantId",
          relatedResource: "site",
          relatedRecordId: site.tenantId
        })
      );
    }
  }

  for (const rack of snapshot.racks) {
    if (!siteIndex.has(rack.siteId)) {
      conflicts.push(
        createConflict({
          code: "rack_missing_site",
          message: `Rack ${rack.id} references site ${rack.siteId}, which does not exist.`,
          resource: "rack",
          recordId: rack.id,
          field: "siteId",
          relatedResource: "site",
          relatedRecordId: rack.siteId
        })
      );
    }
  }

  for (const device of snapshot.devices) {
    const site = siteIndex.get(device.siteId);

    if (!site) {
      conflicts.push(
        createConflict({
          code: "device_missing_site",
          message: `Device ${device.id} references site ${device.siteId}, which does not exist.`,
          resource: "device",
          recordId: device.id,
          field: "siteId",
          relatedResource: "site",
          relatedRecordId: device.siteId
        })
      );
    }

    if (device.rackPosition) {
      const rack = rackIndex.get(device.rackPosition.rackId);

      if (!rack) {
        conflicts.push(
          createConflict({
            code: "device_missing_rack",
            message: `Device ${device.id} references rack ${device.rackPosition.rackId}, which does not exist.`,
            resource: "device",
            recordId: device.id,
            field: "rackPosition.rackId",
            relatedResource: "rack",
            relatedRecordId: device.rackPosition.rackId
          })
        );
      } else if (rack.siteId !== device.siteId) {
        conflicts.push(
          createConflict({
            code: "device_rack_site_mismatch",
            message: `Device ${device.id} belongs to site ${device.siteId} but rack ${rack.id} belongs to site ${rack.siteId}.`,
            resource: "device",
            recordId: device.id,
            field: "siteId",
            relatedResource: "rack",
            relatedRecordId: rack.id
          })
        );
      }
    }
  }

  for (const entry of snapshot.interfaces) {
    if (!deviceIndex.has(entry.deviceId)) {
      conflicts.push(
        createConflict({
          code: "interface_missing_device",
          message: `Interface ${entry.id} references device ${entry.deviceId}, which does not exist.`,
          resource: "interface",
          recordId: entry.id,
          field: "deviceId",
          relatedResource: "device",
          relatedRecordId: entry.deviceId
        })
      );
    }
  }

  for (const connection of snapshot.connections) {
    const fromDevice = deviceIndex.get(connection.fromDeviceId);
    const toDevice = deviceIndex.get(connection.toDeviceId);
    const fromInterface = interfaceIndex.get(connection.fromInterfaceId);
    const toInterface = interfaceIndex.get(connection.toInterfaceId);

    if (!fromDevice) {
      conflicts.push(
        createConflict({
          code: "connection_missing_from_device",
          message: `Connection ${connection.id} references source device ${connection.fromDeviceId}, which does not exist.`,
          resource: "connection",
          recordId: connection.id,
          field: "fromDeviceId",
          relatedResource: "device",
          relatedRecordId: connection.fromDeviceId
        })
      );
    }

    if (!toDevice) {
      conflicts.push(
        createConflict({
          code: "connection_missing_to_device",
          message: `Connection ${connection.id} references destination device ${connection.toDeviceId}, which does not exist.`,
          resource: "connection",
          recordId: connection.id,
          field: "toDeviceId",
          relatedResource: "device",
          relatedRecordId: connection.toDeviceId
        })
      );
    }

    if (!fromInterface) {
      conflicts.push(
        createConflict({
          code: "connection_missing_from_interface",
          message: `Connection ${connection.id} references source interface ${connection.fromInterfaceId}, which does not exist.`,
          resource: "connection",
          recordId: connection.id,
          field: "fromInterfaceId",
          relatedResource: "interface",
          relatedRecordId: connection.fromInterfaceId
        })
      );
    } else if (fromInterface.deviceId !== connection.fromDeviceId) {
      conflicts.push(
        createConflict({
          code: "connection_from_interface_mismatch",
          message: `Connection ${connection.id} binds interface ${fromInterface.id} to device ${connection.fromDeviceId}, but the interface belongs to ${fromInterface.deviceId}.`,
          resource: "connection",
          recordId: connection.id,
          field: "fromInterfaceId",
          relatedResource: "device",
          relatedRecordId: fromInterface.deviceId
        })
      );
    }

    if (!toInterface) {
      conflicts.push(
        createConflict({
          code: "connection_missing_to_interface",
          message: `Connection ${connection.id} references destination interface ${connection.toInterfaceId}, which does not exist.`,
          resource: "connection",
          recordId: connection.id,
          field: "toInterfaceId",
          relatedResource: "interface",
          relatedRecordId: connection.toInterfaceId
        })
      );
    } else if (toInterface.deviceId !== connection.toDeviceId) {
      conflicts.push(
        createConflict({
          code: "connection_to_interface_mismatch",
          message: `Connection ${connection.id} binds interface ${toInterface.id} to device ${connection.toDeviceId}, but the interface belongs to ${toInterface.deviceId}.`,
          resource: "connection",
          recordId: connection.id,
          field: "toInterfaceId",
          relatedResource: "device",
          relatedRecordId: toInterface.deviceId
        })
      );
    }
  }

  const parsedPrefixes = snapshot.prefixes
    .filter((prefix) => prefix.family === 4)
    .map((prefix) => ({
      prefix,
      parsed: parseIpv4Range(prefix.cidr)
    }));

  const ipv6Prefixes = snapshot.prefixes.filter((prefix) => prefix.family === 6);

  if (ipv6Prefixes.length > 0) {
    warnings.push(
      createWarning({
        code: "ipv6_prefix_overlap_not_enabled",
        message: "IPv6 prefix conflict detection is not enabled in the bootstrap validation engine."
      })
    );
  }

  for (const entry of parsedPrefixes) {
    if (!entry.parsed) {
      continue;
    }

    if (entry.prefix.vrfId && !vrfIndex.has(entry.prefix.vrfId)) {
      conflicts.push(
        createConflict({
          code: "prefix_missing_vrf",
          message: `Prefix ${entry.prefix.id} references VRF ${entry.prefix.vrfId}, which does not exist.`,
          resource: "prefix",
          recordId: entry.prefix.id,
          field: "vrfId",
          relatedResource: "vrf",
          relatedRecordId: entry.prefix.vrfId
        })
      );
    }

    if (entry.prefix.parentPrefixId) {
      const parent = prefixIndex.get(entry.prefix.parentPrefixId);

      if (!parent) {
        conflicts.push(
          createConflict({
            code: "prefix_missing_parent",
            message: `Prefix ${entry.prefix.id} references parent prefix ${entry.prefix.parentPrefixId}, which does not exist.`,
            resource: "prefix",
            recordId: entry.prefix.id,
            field: "parentPrefixId",
            relatedResource: "prefix",
            relatedRecordId: entry.prefix.parentPrefixId
          })
        );
      } else if (parent.family !== entry.prefix.family || parent.vrfId !== entry.prefix.vrfId) {
        conflicts.push(
          createConflict({
            code: "prefix_parent_scope_mismatch",
            message: `Prefix ${entry.prefix.id} and parent prefix ${parent.id} must share family and VRF.`,
            resource: "prefix",
            recordId: entry.prefix.id,
            field: "parentPrefixId",
            relatedResource: "prefix",
            relatedRecordId: parent.id
          })
        );
      } else {
        const parsedParent = parseIpv4Range(parent.cidr);

        if (parsedParent && !rangeContains(parsedParent, entry.parsed)) {
          conflicts.push(
            createConflict({
              code: "prefix_outside_parent",
              message: `Prefix ${entry.prefix.id} is not contained by declared parent ${parent.id}.`,
              resource: "prefix",
              recordId: entry.prefix.id,
              field: "cidr",
              relatedResource: "prefix",
              relatedRecordId: parent.id
            })
          );
        }
      }
    }
  }

  for (let index = 0; index < parsedPrefixes.length; index += 1) {
    const left = parsedPrefixes[index];

    if (!left?.parsed) {
      continue;
    }

    for (let compareIndex = index + 1; compareIndex < parsedPrefixes.length; compareIndex += 1) {
      const right = parsedPrefixes[compareIndex];

      if (!right?.parsed) {
        continue;
      }

      if (left.prefix.vrfId !== right.prefix.vrfId || left.prefix.family !== right.prefix.family) {
        continue;
      }

      if (!rangesOverlap(left.parsed, right.parsed)) {
        continue;
      }

      if (left.prefix.id === right.prefix.id) {
        continue;
      }

      if (isContainedByDeclaredRelationship(left.prefix, right.prefix, left.parsed, right.parsed)) {
        continue;
      }

      const overlapCode =
        rangeContains(left.parsed, right.parsed) || rangeContains(right.parsed, left.parsed)
          ? "prefix_undeclared_containment"
          : "prefix_overlap";

      conflicts.push(
        createConflict({
          code: overlapCode,
          message: `Prefix ${left.prefix.id} (${left.prefix.cidr}) overlaps prefix ${right.prefix.id} (${right.prefix.cidr}) in the same VRF without a valid declared hierarchy.`,
          resource: "prefix",
          recordId: left.prefix.id,
          field: "cidr",
          relatedResource: "prefix",
          relatedRecordId: right.prefix.id
        })
      );
    }
  }

  const parsedAddresses = snapshot.ipAddresses
    .filter((address) => address.family === 4)
    .map((address) => ({
      address,
      parsed: parseIpv4Range(address.address)
    }));

  const seenHosts = new Map<string, ValidationIpAddressLike>();

  for (const entry of parsedAddresses) {
    if (!entry?.parsed) {
      continue;
    }

    if (entry.address.vrfId && !vrfIndex.has(entry.address.vrfId)) {
      conflicts.push(
        createConflict({
          code: "ip_missing_vrf",
          message: `IP address ${entry.address.id} references VRF ${entry.address.vrfId}, which does not exist.`,
          resource: "ip-address",
          recordId: entry.address.id,
          field: "vrfId",
          relatedResource: "vrf",
          relatedRecordId: entry.address.vrfId
        })
      );
    }

    if (entry.address.prefixId) {
      const prefix = prefixIndex.get(entry.address.prefixId);

      if (!prefix) {
        conflicts.push(
          createConflict({
            code: "ip_missing_prefix",
            message: `IP address ${entry.address.id} references prefix ${entry.address.prefixId}, which does not exist.`,
            resource: "ip-address",
            recordId: entry.address.id,
            field: "prefixId",
            relatedResource: "prefix",
            relatedRecordId: entry.address.prefixId
          })
        );
      } else if (prefix.vrfId !== entry.address.vrfId || prefix.family !== entry.address.family) {
        conflicts.push(
          createConflict({
            code: "ip_prefix_scope_mismatch",
            message: `IP address ${entry.address.id} must share family and VRF with prefix ${prefix.id}.`,
            resource: "ip-address",
            recordId: entry.address.id,
            field: "prefixId",
            relatedResource: "prefix",
            relatedRecordId: prefix.id
          })
        );
      } else {
        const parsedPrefix = parseIpv4Range(prefix.cidr);

        if (parsedPrefix && (entry.parsed.host < parsedPrefix.start || entry.parsed.host > parsedPrefix.end)) {
          conflicts.push(
            createConflict({
              code: "ip_outside_prefix",
              message: `IP address ${entry.address.id} is outside prefix ${prefix.id}.`,
              resource: "ip-address",
              recordId: entry.address.id,
              field: "address",
              relatedResource: "prefix",
              relatedRecordId: prefix.id
            })
          );
        }
      }
    }

    if (entry.address.interfaceId) {
      const iface = interfaceIndex.get(entry.address.interfaceId);

      if (!iface) {
        conflicts.push(
          createConflict({
            code: "ip_missing_interface",
            message: `IP address ${entry.address.id} references interface ${entry.address.interfaceId}, which does not exist.`,
            resource: "ip-address",
            recordId: entry.address.id,
            field: "interfaceId",
            relatedResource: "interface",
            relatedRecordId: entry.address.interfaceId
          })
        );
      } else if (!deviceIndex.has(iface.deviceId)) {
        conflicts.push(
          createConflict({
            code: "ip_interface_missing_device",
            message: `IP address ${entry.address.id} references interface ${iface.id}, but its device ${iface.deviceId} does not exist.`,
            resource: "ip-address",
            recordId: entry.address.id,
            field: "interfaceId",
            relatedResource: "device",
            relatedRecordId: iface.deviceId
          })
        );
      }
    }

    const duplicateKey = `${entry.address.vrfId ?? "global"}:${entry.parsed.host}`;
    const existing = seenHosts.get(duplicateKey);

    if (existing && existing.id !== entry.address.id) {
      conflicts.push(
        createConflict({
          code: "ip_overlap",
          message: `IP address ${entry.address.id} duplicates address space already used by ${existing.id} in the same VRF.`,
          resource: "ip-address",
          recordId: entry.address.id,
          field: "address",
          relatedResource: "ip-address",
          relatedRecordId: existing.id
        })
      );
    } else {
      seenHosts.set(duplicateKey, entry.address);
    }
  }

  if (snapshot.ipAddresses.some((address) => address.family === 6)) {
    warnings.push(
      createWarning({
        code: "ipv6_ip_overlap_not_enabled",
        message: "IPv6 IP overlap detection is not enabled in the bootstrap validation engine."
      })
    );
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    warnings
  };
}
