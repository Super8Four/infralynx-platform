import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { validateInventorySnapshot, type ValidationSummary } from "../../validation/dist/index.js";

export type BackupSection =
  | "auth"
  | "audit"
  | "events"
  | "inventory"
  | "jobs"
  | "media"
  | "scheduler"
  | "transfers"
  | "webhooks"
  | "workflows";

export type BackupEngine = "bootstrap-file-store" | "postgres" | "mssql" | "mariadb";
export type BackupMode = "full" | "partial";

export interface BackupRecord {
  readonly id: string;
  readonly label: string;
  readonly mode: BackupMode;
  readonly engine: BackupEngine;
  readonly sections: readonly BackupSection[];
  readonly archivePath: string;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly createdBy: string;
  readonly tenantId: string | null;
  readonly createdAt: string;
}

export interface BackupLogRecord {
  readonly backupId: string;
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly timestamp: string;
}

export interface BackupEntry {
  readonly path: string;
  readonly contentBase64: string;
}

export interface BackupArchive {
  readonly version: 1;
  readonly record: BackupRecord;
  readonly entries: readonly BackupEntry[];
}

export interface BackupValidationResult {
  readonly valid: boolean;
  readonly reason: string;
  readonly sections: readonly BackupSection[];
}

export interface BackupCreateResult {
  readonly record: BackupRecord;
  readonly logs: readonly BackupLogRecord[];
}

export interface BackupRestorePreview {
  readonly valid: boolean;
  readonly sections: readonly BackupSection[];
  readonly warnings: readonly string[];
  readonly validation: ValidationSummary | null;
}

export interface BackupRestoreResult {
  readonly restored: boolean;
  readonly backupId: string;
  readonly sections: readonly BackupSection[];
  readonly warnings: readonly string[];
  readonly validation: ValidationSummary | null;
}

interface BackupState {
  readonly backups: readonly BackupRecord[];
  readonly logs: readonly BackupLogRecord[];
}

interface BackupStoreOptions {
  readonly stateFilePath: string;
  readonly archiveDirectory: string;
  readonly sourceRoot: string;
}

const EMPTY_STATE: BackupState = {
  backups: [],
  logs: []
};

export const backupSectionDirectories: Readonly<Record<BackupSection, string>> = {
  auth: "auth",
  audit: "audit",
  events: "events",
  inventory: "inventory",
  jobs: "jobs",
  media: "media",
  scheduler: "scheduler",
  transfers: "transfers",
  webhooks: "webhooks",
  workflows: "workflows"
};

export const supportedBackupSections = Object.keys(backupSectionDirectories) as readonly BackupSection[];

export const backupEngineStrategies: Readonly<Record<BackupEngine, string>> = {
  "bootstrap-file-store": "Creates compressed snapshots of the runtime-data file store used by the current bootstrap platform.",
  postgres: "Use pg_dump and pg_restore for consistent logical backups and recovery validation.",
  mssql: "Use BACKUP DATABASE and RESTORE VERIFYONLY or equivalent SQL Server native tooling.",
  mariadb: "Use mariadb-dump or mysqldump with restore verification before promotion."
};

function sleep(milliseconds: number) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {
    // Intentional synchronous wait to match the file-backed runtime store pattern.
  }
}

function createBackupId() {
  return `backup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBackupLog(
  backupId: string,
  level: "info" | "warn" | "error",
  message: string,
  timestamp = new Date().toISOString()
): BackupLogRecord {
  return {
    backupId,
    level,
    message,
    timestamp
  };
}

function sanitizeLabel(value: string | null | undefined) {
  if (!value || value.trim().length === 0) {
    return "platform-backup";
  }

  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

function resolveSections(mode: BackupMode, sections?: readonly BackupSection[]) {
  if (mode === "full") {
    return supportedBackupSections;
  }

  const requested = [...new Set((sections ?? []).filter((section) => supportedBackupSections.includes(section)))];
  return requested;
}

function collectFiles(rootPath: string): readonly string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  const stat = statSync(rootPath);

  if (!stat.isDirectory()) {
    return [rootPath];
  }

  return readdirSync(rootPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectFiles(join(rootPath, entry.name)));
}

function collectEntries(sourceRoot: string, sections: readonly BackupSection[]): readonly BackupEntry[] {
  const entries: BackupEntry[] = [];

  for (const section of sections) {
    const sectionDirectory = resolve(sourceRoot, backupSectionDirectories[section]);

    for (const filePath of collectFiles(sectionDirectory)) {
      const stat = statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      entries.push({
        path: relative(sourceRoot, filePath).replace(/\\/g, "/"),
        contentBase64: readFileSync(filePath).toString("base64")
      });
    }
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function parseArchive(content: Buffer): BackupArchive {
  const parsed = JSON.parse(gunzipSync(content).toString("utf8")) as BackupArchive;

  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries) || !parsed.record) {
    throw new Error("backup archive is invalid");
  }

  return parsed;
}

function computeArchiveChecksum(archive: BackupArchive) {
  const normalized = JSON.stringify({
    version: archive.version,
    record: {
      ...archive.record,
      checksum: "",
      sizeBytes: 0
    },
    entries: archive.entries
  });

  return createHash("sha256").update(normalized).digest("hex");
}

function ensureSafeRelativePath(value: string) {
  if (value.includes("..") || value.startsWith("/") || value.startsWith("\\")) {
    throw new Error(`backup entry path ${value} is not safe to restore`);
  }

  return value;
}

function loadInventoryValidation(entries: readonly BackupEntry[]): ValidationSummary | null {
  const inventoryEntry = entries.find((entry) => entry.path === "inventory/state.json");

  if (!inventoryEntry) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(inventoryEntry.contentBase64, "base64").toString("utf8")) as {
      readonly sites?: readonly unknown[];
      readonly racks?: readonly unknown[];
      readonly devices?: readonly unknown[];
      readonly prefixes?: readonly unknown[];
      readonly ipAddresses?: readonly unknown[];
    };

    return validateInventorySnapshot({
      tenants: [{ id: "tenant-ops" }, { id: "tenant-net" }],
      vrfs: [
        { id: "vrf-global", tenantId: "tenant-net" },
        { id: "vrf-campus", tenantId: "tenant-ops" }
      ],
      sites: (parsed.sites ?? []) as never,
      racks: (parsed.racks ?? []) as never,
      devices: (parsed.devices ?? []) as never,
      interfaces: [],
      connections: [],
      prefixes: (parsed.prefixes ?? []) as never,
      ipAddresses: (parsed.ipAddresses ?? []) as never
    });
  } catch {
    return {
      valid: false,
      conflicts: [
        {
          code: "backup_inventory_parse_failed",
          message: "inventory state inside the backup could not be parsed for restore validation",
          resource: "prefix",
          recordId: null
        }
      ],
      warnings: []
    };
  }
}

export function validateBackupRequest(input: {
  readonly mode: BackupMode;
  readonly sections?: readonly BackupSection[];
  readonly engine?: BackupEngine;
}): BackupValidationResult {
  const mode = input.mode;

  if (mode !== "full" && mode !== "partial") {
    return {
      valid: false,
      reason: "backup mode must be full or partial",
      sections: []
    };
  }

  const sections = resolveSections(mode, input.sections);

  if (sections.length === 0) {
    return {
      valid: false,
      reason: "at least one backup section is required",
      sections
    };
  }

  const engine = input.engine ?? "bootstrap-file-store";

  if (!(engine in backupEngineStrategies)) {
    return {
      valid: false,
      reason: "backup engine is not supported",
      sections
    };
  }

  return {
    valid: true,
    reason: "backup request is valid",
    sections
  };
}

export class FileBackedBackupStore {
  readonly #stateFilePath: string;
  readonly #archiveDirectory: string;
  readonly #sourceRoot: string;
  readonly #lockPath: string;

  constructor(options: BackupStoreOptions) {
    this.#stateFilePath = options.stateFilePath;
    this.#archiveDirectory = options.archiveDirectory;
    this.#sourceRoot = options.sourceRoot;
    this.#lockPath = `${options.stateFilePath}.lock`;
  }

  listBackups() {
    return [...this.#loadState().backups].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getBackup(backupId: string) {
    return this.#loadState().backups.find((backup) => backup.id === backupId) ?? null;
  }

  listLogs(backupId?: string) {
    const logs = this.#loadState().logs;
    return backupId ? logs.filter((log) => log.backupId === backupId) : logs;
  }

  createBackup(input: {
    readonly mode: BackupMode;
    readonly sections?: readonly BackupSection[];
    readonly engine?: BackupEngine;
    readonly label?: string;
    readonly createdBy: string;
    readonly tenantId?: string | null;
    readonly createdAt?: string;
  }): BackupCreateResult {
    const validation = validateBackupRequest(input);

    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    return this.#withLockedState((state) => {
      const createdAt = input.createdAt ?? new Date().toISOString();
      const backupId = createBackupId();
      const entries = collectEntries(this.#sourceRoot, validation.sections);
      const recordBase: BackupRecord = {
        id: backupId,
        label: sanitizeLabel(input.label),
        mode: input.mode,
        engine: input.engine ?? "bootstrap-file-store",
        sections: validation.sections,
        archivePath: resolve(this.#archiveDirectory, `${backupId}.json.gz`),
        checksum: "",
        sizeBytes: 0,
        createdBy: input.createdBy,
        tenantId: input.tenantId ?? null,
        createdAt
      };
      const record: BackupRecord = {
        ...recordBase,
        checksum: "",
        sizeBytes: 0
      };
      const persistedArchive: BackupArchive = {
        version: 1,
        record,
        entries
      };
      const finalChecksum = computeArchiveChecksum(persistedArchive);
      const finalizedRecord: BackupRecord = {
        ...record,
        checksum: finalChecksum,
        sizeBytes: 0
      };
      const finalizedArchive: BackupArchive = {
        version: 1,
        record: finalizedRecord,
        entries
      };
      const persistedContent = gzipSync(JSON.stringify(finalizedArchive));
      const sizedRecord: BackupRecord = {
        ...finalizedRecord,
        sizeBytes: persistedContent.byteLength
      };
      const sizedArchive: BackupArchive = {
        version: 1,
        record: sizedRecord,
        entries
      };
      const finalContent = gzipSync(JSON.stringify(sizedArchive));

      mkdirSync(this.#archiveDirectory, { recursive: true });
      writeFileSync(record.archivePath, finalContent);

      const logs = [
        createBackupLog(backupId, "info", `created ${sizedRecord.mode} backup for ${sizedRecord.sections.join(", ")}`, createdAt)
      ];

      return {
        nextState: {
          backups: [...state.backups, sizedRecord],
          logs: [...state.logs, ...logs]
        },
        result: {
          record: sizedRecord,
          logs
        }
      };
    });
  }

  readArchive(backupId: string): BackupArchive {
    const record = this.getBackup(backupId);

    if (!record) {
      throw new Error(`backup ${backupId} was not found`);
    }

    const content = readFileSync(record.archivePath);
    const archive = parseArchive(content);
    const checksum = computeArchiveChecksum(archive);

    if (checksum !== record.checksum) {
      throw new Error(`backup ${backupId} checksum verification failed`);
    }

    return archive;
  }

  validateRestore(backupId: string): BackupRestorePreview {
    const archive = this.readArchive(backupId);
    const warnings: string[] = [];
    const validation = loadInventoryValidation(archive.entries);

    if (archive.record.engine !== "bootstrap-file-store") {
      warnings.push(`restore preview is running against ${archive.record.engine} metadata in bootstrap file-store mode`);
    }

    return {
      valid: validation ? validation.valid : true,
      sections: archive.record.sections,
      warnings,
      validation
    };
  }

  restoreBackup(backupId: string): BackupRestoreResult {
    const preview = this.validateRestore(backupId);

    if (!preview.valid) {
      throw new Error("restore preview failed validation");
    }

    return this.#withLockedState((state) => {
      const archive = this.readArchive(backupId);
      const rollbackRoot = resolve(this.#archiveDirectory, "_rollback", backupId);

      rmSync(rollbackRoot, { recursive: true, force: true });
      mkdirSync(rollbackRoot, { recursive: true });

      for (const section of archive.record.sections) {
        const sectionDirectory = resolve(this.#sourceRoot, backupSectionDirectories[section]);

        if (existsSync(sectionDirectory)) {
          cpSync(sectionDirectory, resolve(rollbackRoot, backupSectionDirectories[section]), { recursive: true });
        }
      }

      try {
        for (const section of archive.record.sections) {
          rmSync(resolve(this.#sourceRoot, backupSectionDirectories[section]), { recursive: true, force: true });
        }

        for (const entry of archive.entries) {
          const targetPath = resolve(this.#sourceRoot, ensureSafeRelativePath(entry.path));
          mkdirSync(dirname(targetPath), { recursive: true });
          writeFileSync(targetPath, Buffer.from(entry.contentBase64, "base64"));
        }
      } catch (error) {
        for (const section of archive.record.sections) {
          const sectionDirectory = resolve(this.#sourceRoot, backupSectionDirectories[section]);
          rmSync(sectionDirectory, { recursive: true, force: true });

          const rollbackSection = resolve(rollbackRoot, backupSectionDirectories[section]);

          if (existsSync(rollbackSection)) {
            cpSync(rollbackSection, sectionDirectory, { recursive: true });
          }
        }

        throw error;
      } finally {
        rmSync(rollbackRoot, { recursive: true, force: true });
      }

      const restoredAt = new Date().toISOString();
      const logs = [
        createBackupLog(backupId, "info", `restored backup into ${archive.record.sections.join(", ")}`, restoredAt)
      ];

      return {
        nextState: {
          backups: state.backups,
          logs: [...state.logs, ...logs]
        },
        result: {
          restored: true,
          backupId,
          sections: archive.record.sections,
          warnings: preview.warnings,
          validation: preview.validation
        }
      };
    });
  }

  deleteBackup(backupId: string) {
    return this.#withLockedState((state) => {
      const backup = state.backups.find((entry) => entry.id === backupId);

      if (!backup) {
        return {
          nextState: state,
          result: false
        };
      }

      rmSync(backup.archivePath, { force: true });

      return {
        nextState: {
          backups: state.backups.filter((entry) => entry.id !== backupId),
          logs: [...state.logs, createBackupLog(backupId, "warn", `deleted backup ${backupId}`)]
        },
        result: true
      };
    });
  }

  #withLockedState<TResult>(callback: (state: BackupState) => { readonly nextState: BackupState; readonly result: TResult }) {
    this.#acquireLock();

    try {
      const outcome = callback(this.#loadState());
      this.#persistState(outcome.nextState);
      return outcome.result;
    } finally {
      this.#releaseLock();
    }
  }

  #acquireLock() {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        writeFileSync(this.#lockPath, String(process.pid), { flag: "wx" });
        return;
      } catch {
        sleep(25);
      }
    }

    throw new Error("unable to acquire backup state lock");
  }

  #releaseLock() {
    try {
      unlinkSync(this.#lockPath);
    } catch {
      // Lock cleanup should not block callers.
    }
  }

  #loadState(): BackupState {
    try {
      const parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as BackupState;
      return {
        backups: parsed.backups ?? [],
        logs: parsed.logs ?? []
      };
    } catch {
      return EMPTY_STATE;
    }
  }

  #persistState(state: BackupState) {
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    writeFileSync(this.#stateFilePath, JSON.stringify(state, null, 2));
  }
}

export function createFileBackedBackupStore(options: BackupStoreOptions) {
  return new FileBackedBackupStore(options);
}

export function resetFileBackedBackupStore(stateFilePath: string, archiveDirectory: string) {
  rmSync(stateFilePath, { force: true });
  rmSync(`${stateFilePath}.lock`, { force: true });
  rmSync(archiveDirectory, { recursive: true, force: true });
}

export function executeBackupJobPayload(
  options: {
    readonly stateFilePath: string;
    readonly archiveDirectory: string;
    readonly sourceRoot: string;
  },
  payload: Record<string, unknown>
) {
  const store = createFileBackedBackupStore(options);
  const mode = payload["mode"] === "partial" ? "partial" : "full";
  const sections = Array.isArray(payload["sections"])
    ? payload["sections"].filter((value): value is BackupSection => typeof value === "string" && supportedBackupSections.includes(value as BackupSection))
    : undefined;
  const result = store.createBackup({
    mode,
    sections,
    engine: typeof payload["engine"] === "string" ? payload["engine"] as BackupEngine : "bootstrap-file-store",
    label: typeof payload["label"] === "string" ? payload["label"] : undefined,
    createdBy: typeof payload["createdBy"] === "string" ? payload["createdBy"] : "scheduler",
    tenantId: typeof payload["tenantId"] === "string" ? payload["tenantId"] : null
  });

  return {
    backupId: result.record.id,
    archivePath: result.record.archivePath,
    sections: result.record.sections,
    checksum: result.record.checksum,
    sizeBytes: result.record.sizeBytes
  };
}
