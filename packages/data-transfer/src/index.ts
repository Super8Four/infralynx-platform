import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { defaultTenantStatuses } from "../../core-domain/dist/index.js";
import { validatePrefix } from "../../ipam-domain/dist/index.js";

export type TransferDataset = "tenants" | "prefixes" | "sites";
export type TransferFormat = "csv" | "json" | "api";

export interface TenantTransferRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
}

export interface PrefixTransferRecord {
  readonly id: string;
  readonly vrfId: string;
  readonly cidr: string;
  readonly status: string;
  readonly tenantId: string | null;
  readonly vlanId: string | null;
  readonly parentPrefixId: string | null;
}

export interface SiteTransferRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tenantId: string | null;
}

export interface TransferStoreState {
  readonly tenants: readonly TenantTransferRecord[];
  readonly prefixes: readonly PrefixTransferRecord[];
  readonly sites: readonly SiteTransferRecord[];
}

export interface TransferValidationError {
  readonly row: number;
  readonly field: string;
  readonly message: string;
}

export interface TransferValidationResult<TRecord> {
  readonly valid: boolean;
  readonly dataset: TransferDataset;
  readonly format: TransferFormat;
  readonly recordCount: number;
  readonly errors: readonly TransferValidationError[];
  readonly warnings: readonly string[];
  readonly records: readonly TRecord[];
}

export interface TransferExecutionResult<TRecord> extends TransferValidationResult<TRecord> {
  readonly committed: boolean;
}

type TransferRecordMap = {
  readonly tenants: TenantTransferRecord;
  readonly prefixes: PrefixTransferRecord;
  readonly sites: SiteTransferRecord;
};

interface ImportInput {
  readonly dataset: TransferDataset;
  readonly format: TransferFormat;
  readonly csvContent?: string;
  readonly jsonContent?: string;
  readonly records?: readonly Record<string, unknown>[];
}

const defaultTransferState: TransferStoreState = {
  tenants: [
    { id: "tenant-ops", slug: "operations", name: "Operations", status: "active" },
    { id: "tenant-net", slug: "network-engineering", name: "Network Engineering", status: "active" }
  ],
  prefixes: [
    {
      id: "prefix-global-root",
      vrfId: "vrf-global",
      cidr: "10.40.0.0/16",
      status: "active",
      tenantId: "tenant-net",
      vlanId: null,
      parentPrefixId: null
    },
    {
      id: "prefix-global-apps",
      vrfId: "vrf-global",
      cidr: "10.40.16.0/24",
      status: "active",
      tenantId: "tenant-net",
      vlanId: "vlan-120",
      parentPrefixId: "prefix-global-root"
    }
  ],
  sites: [
    { id: "site-dal1", slug: "dal1", name: "Dallas One", tenantId: "tenant-ops" },
    { id: "site-phx1", slug: "phx1", name: "Phoenix One", tenantId: "tenant-ops" }
  ]
};

const datasetHeaders: Readonly<Record<TransferDataset, readonly string[]>> = {
  tenants: ["id", "slug", "name", "status"],
  prefixes: ["id", "vrfId", "cidr", "status", "tenantId", "vlanId", "parentPrefixId"],
  sites: ["id", "slug", "name", "tenantId"]
};

function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);

  return cells.map((cell) => cell.trim());
}

function escapeCsvValue(value: string | null): string {
  const normalized = value ?? "";

  if (normalized.includes(",") || normalized.includes("\"") || normalized.includes("\n")) {
    return `"${normalized.replaceAll("\"", "\"\"")}"`;
  }

  return normalized;
}

function parseCsvRecords(dataset: TransferDataset, content: string): readonly Record<string, unknown>[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  const expectedHeaders = datasetHeaders[dataset];

  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(`CSV headers for ${dataset} must be ${expectedHeaders.join(", ")}`);
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(
      expectedHeaders.map((header, index) => [header, normalizeCell(cells[index])])
    );
  });
}

function parseJsonRecords(content: string): readonly Record<string, unknown>[] {
  const parsed = JSON.parse(content) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("JSON import content must be an array of records");
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("JSON import content must contain only object records");
    }

    return entry as Record<string, unknown>;
  });
}

function coerceTenantRecord(record: Record<string, unknown>, row: number) {
  const errors: TransferValidationError[] = [];
  const tenantRecord: TenantTransferRecord = {
    id: normalizeCell(record["id"]) ?? "",
    slug: normalizeCell(record["slug"]) ?? "",
    name: normalizeCell(record["name"]) ?? "",
    status: normalizeCell(record["status"]) ?? ""
  };

  if (!tenantRecord.id) {
    errors.push({ row, field: "id", message: "tenant id is required" });
  }
  if (!tenantRecord.slug) {
    errors.push({ row, field: "slug", message: "tenant slug is required" });
  }
  if (!tenantRecord.name) {
    errors.push({ row, field: "name", message: "tenant name is required" });
  }
  if (!tenantRecord.status || !defaultTenantStatuses.some((status) => status.slug === tenantRecord.status)) {
    errors.push({
      row,
      field: "status",
      message: `tenant status must be one of: ${defaultTenantStatuses.map((status) => status.slug).join(", ")}`
    });
  }

  return {
    record: errors.length === 0 ? tenantRecord : null,
    errors
  };
}

function coercePrefixRecord(record: Record<string, unknown>, row: number) {
  const errors: TransferValidationError[] = [];
  const prefixRecord: PrefixTransferRecord = {
    id: normalizeCell(record["id"]) ?? "",
    vrfId: normalizeCell(record["vrfId"]) ?? "",
    cidr: normalizeCell(record["cidr"]) ?? "",
    status: normalizeCell(record["status"]) ?? "",
    tenantId: normalizeCell(record["tenantId"]),
    vlanId: normalizeCell(record["vlanId"]),
    parentPrefixId: normalizeCell(record["parentPrefixId"])
  };

  if (!prefixRecord.id) {
    errors.push({ row, field: "id", message: "prefix id is required" });
  }
  if (!prefixRecord.vrfId) {
    errors.push({ row, field: "vrfId", message: "vrfId is required" });
  }
  if (!prefixRecord.status) {
    errors.push({ row, field: "status", message: "prefix status is required" });
  }

  const validation = validatePrefix({
    id: prefixRecord.id || `row-${row}`,
    vrfId: prefixRecord.vrfId || null,
    parentPrefixId: prefixRecord.parentPrefixId,
    cidr: prefixRecord.cidr,
    family: prefixRecord.cidr.includes(":") ? 6 : 4,
    status:
      prefixRecord.status === "active" ||
      prefixRecord.status === "reserved" ||
      prefixRecord.status === "deprecated"
        ? prefixRecord.status
        : "active",
    allocationMode: "pool",
    tenantId: prefixRecord.tenantId,
    vlanId: prefixRecord.vlanId
  });

  if (!validation.valid) {
    errors.push({ row, field: "cidr", message: validation.reason });
  }

  return {
    record: errors.length === 0 ? prefixRecord : null,
    errors
  };
}

function coerceSiteRecord(record: Record<string, unknown>, row: number) {
  const errors: TransferValidationError[] = [];
  const siteRecord: SiteTransferRecord = {
    id: normalizeCell(record["id"]) ?? "",
    slug: normalizeCell(record["slug"]) ?? "",
    name: normalizeCell(record["name"]) ?? "",
    tenantId: normalizeCell(record["tenantId"])
  };

  if (!siteRecord.id) {
    errors.push({ row, field: "id", message: "site id is required" });
  }
  if (!siteRecord.slug) {
    errors.push({ row, field: "slug", message: "site slug is required" });
  }
  if (!siteRecord.name) {
    errors.push({ row, field: "name", message: "site name is required" });
  }

  return {
    record: errors.length === 0 ? siteRecord : null,
    errors
  };
}

function coerceRecords<TDataset extends TransferDataset>(
  dataset: TDataset,
  rawRecords: readonly Record<string, unknown>[]
): TransferValidationResult<TransferRecordMap[TDataset]> {
  const errors: TransferValidationError[] = [];
  const records: TransferRecordMap[TDataset][] = [];

  rawRecords.forEach((rawRecord, index) => {
    const row = index + 2;
    const coerced =
      dataset === "tenants"
        ? coerceTenantRecord(rawRecord, row)
        : dataset === "prefixes"
          ? coercePrefixRecord(rawRecord, row)
          : coerceSiteRecord(rawRecord, row);

    errors.push(...coerced.errors);

    if (coerced.record) {
      records.push(coerced.record as TransferRecordMap[TDataset]);
    }
  });

  const duplicateIds = records
    .map((record) => record.id)
    .filter((id, index, values) => values.indexOf(id) !== index);

  duplicateIds.forEach((id) => {
    errors.push({ row: 0, field: "id", message: `duplicate id detected: ${id}` });
  });

  return {
    valid: errors.length === 0,
    dataset,
    format: "api",
    recordCount: records.length,
    errors,
    warnings: [],
    records
  };
}

export function loadTransferStore(stateFilePath: string): TransferStoreState {
  try {
    const parsed = JSON.parse(readFileSync(stateFilePath, "utf8")) as Partial<TransferStoreState>;
    return {
      tenants: parsed.tenants ?? defaultTransferState.tenants,
      prefixes: parsed.prefixes ?? defaultTransferState.prefixes,
      sites: parsed.sites ?? defaultTransferState.sites
    };
  } catch {
    return defaultTransferState;
  }
}

export function saveTransferStore(stateFilePath: string, state: TransferStoreState) {
  mkdirSync(dirname(stateFilePath), { recursive: true });
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
}

export function validateImportInput<TDataset extends TransferDataset>(
  input: ImportInput & { readonly dataset: TDataset }
): TransferValidationResult<TransferRecordMap[TDataset]> {
  let rawRecords: readonly Record<string, unknown>[];

  try {
    rawRecords =
      input.format === "csv"
        ? parseCsvRecords(input.dataset, input.csvContent ?? "")
        : input.format === "json"
          ? parseJsonRecords(input.jsonContent ?? "[]")
          : input.records ?? [];
  } catch (error) {
    return {
      valid: false,
      dataset: input.dataset,
      format: input.format,
      recordCount: 0,
      errors: [{
        row: 0,
        field: "document",
        message: error instanceof Error ? error.message : "unable to parse import content"
      }],
      warnings: [],
      records: []
    };
  }

  const validation = coerceRecords(input.dataset, rawRecords);
  return {
    ...validation,
    format: input.format
  };
}

export function applyImport<TDataset extends TransferDataset>(
  stateFilePath: string,
  input: ImportInput & { readonly dataset: TDataset }
): TransferExecutionResult<TransferRecordMap[TDataset]> {
  const validation = validateImportInput(input);

  if (!validation.valid) {
    return {
      ...validation,
      committed: false
    };
  }

  const currentState = loadTransferStore(stateFilePath);
  const nextState: TransferStoreState = {
    ...currentState,
    [input.dataset]: validation.records
  };

  saveTransferStore(stateFilePath, nextState);

  return {
    ...validation,
    committed: true
  };
}

export function exportDataset(
  stateFilePath: string,
  dataset: TransferDataset,
  format: TransferFormat
): {
  readonly contentType: string;
  readonly body: string;
  readonly recordCount: number;
} {
  const state = loadTransferStore(stateFilePath);
  const records = state[dataset];

  if (format === "csv") {
    const headers = datasetHeaders[dataset];
    const lines = [
      headers.join(","),
      ...records.map((record) =>
        headers.map((header) => escapeCsvValue(normalizeCell(record[header as keyof typeof record]))).join(",")
      )
    ];

    return {
      contentType: "text/csv; charset=utf-8",
      body: lines.join("\n"),
      recordCount: records.length
    };
  }

  return {
    contentType: "application/json; charset=utf-8",
    body:
      format === "api"
        ? JSON.stringify({ dataset, recordCount: records.length, records }, null, 2)
        : JSON.stringify(records, null, 2),
    recordCount: records.length
  };
}

export function createImportJobPayload(input: {
  readonly dataset: TransferDataset;
  readonly format: TransferFormat;
  readonly dryRun: boolean;
  readonly csvContent?: string;
  readonly jsonContent?: string;
  readonly records?: readonly Record<string, unknown>[];
  readonly stateFilePath: string;
}) {
  return {
    dataset: input.dataset,
    format: input.format,
    dryRun: input.dryRun,
    csvContent: input.csvContent ?? null,
    jsonContent: input.jsonContent ?? null,
    records: input.records ?? null,
    stateFilePath: input.stateFilePath
  };
}

export function executeImportJobPayload(payload: Record<string, unknown>) {
  const dataset = payload["dataset"];
  const format = payload["format"];
  const stateFilePath = payload["stateFilePath"];

  if (
    (dataset !== "tenants" && dataset !== "prefixes" && dataset !== "sites") ||
    (format !== "csv" && format !== "json" && format !== "api") ||
    typeof stateFilePath !== "string"
  ) {
    throw new Error("invalid data-transfer.import job payload");
  }

  const input = {
    dataset,
    format,
    csvContent: typeof payload["csvContent"] === "string" ? payload["csvContent"] : undefined,
    jsonContent: typeof payload["jsonContent"] === "string" ? payload["jsonContent"] : undefined,
    records: Array.isArray(payload["records"])
      ? (payload["records"] as readonly Record<string, unknown>[])
      : undefined
  } satisfies ImportInput;

  const dryRun = payload["dryRun"] === true;
  const result = dryRun
    ? {
        ...validateImportInput(input),
        committed: false
      }
    : applyImport(stateFilePath, input);

  return {
    dataset,
    format,
    committed: result.committed,
    recordCount: result.recordCount,
    valid: result.valid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length
  };
}
