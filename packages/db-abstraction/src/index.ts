export type DatabaseEngine = "postgres" | "mssql" | "mariadb";

export type CapabilityStatus = "native" | "emulated" | "restricted";

export interface EngineCapability {
  readonly capability: string;
  readonly status: CapabilityStatus;
  readonly notes: string;
}

export interface EngineProfile {
  readonly engine: DatabaseEngine;
  readonly reference: boolean;
  readonly parameterStyle: string;
  readonly identifierQuoting: string;
  readonly migrationDirectory: string;
  readonly capabilities: readonly EngineCapability[];
}

export interface MigrationRule {
  readonly rule: string;
  readonly rationale: string;
}

export const engineProfiles: readonly EngineProfile[] = [
  {
    engine: "postgres",
    reference: true,
    parameterStyle: "positional ($1, $2, ...)",
    identifierQuoting: "double quotes",
    migrationDirectory: "migrations/postgres",
    capabilities: [
      {
        capability: "transactional-ddl",
        status: "native",
        notes: "Default reference behavior for schema changes."
      },
      {
        capability: "json-document-columns",
        status: "native",
        notes: "Use as the canonical JSON capability for abstraction design."
      },
      {
        capability: "generated-columns",
        status: "native",
        notes: "Available directly but must stay abstracted behind capability flags."
      }
    ]
  },
  {
    engine: "mssql",
    reference: false,
    parameterStyle: "named (@p1, @p2, ...)",
    identifierQuoting: "square brackets",
    migrationDirectory: "migrations/mssql",
    capabilities: [
      {
        capability: "transactional-ddl",
        status: "restricted",
        notes: "Migration steps must model DDL transaction limitations explicitly."
      },
      {
        capability: "json-document-columns",
        status: "emulated",
        notes: "JSON support is expression-based rather than a dedicated JSON type."
      },
      {
        capability: "generated-columns",
        status: "native",
        notes: "Computed columns exist but semantics differ from PostgreSQL."
      }
    ]
  },
  {
    engine: "mariadb",
    reference: false,
    parameterStyle: "positional (?)",
    identifierQuoting: "backticks",
    migrationDirectory: "migrations/mariadb",
    capabilities: [
      {
        capability: "transactional-ddl",
        status: "restricted",
        notes: "Assume partial rollback semantics for DDL and design migrations defensively."
      },
      {
        capability: "json-document-columns",
        status: "emulated",
        notes: "JSON storage semantics differ from PostgreSQL and must not be assumed equivalent."
      },
      {
        capability: "generated-columns",
        status: "native",
        notes: "Supported with engine-specific syntax differences."
      }
    ]
  }
] as const;

export const migrationRules: readonly MigrationRule[] = [
  {
    rule: "Author every migration against the shared abstraction contract first.",
    rationale: "Reference-engine SQL cannot be treated as portable implementation by default."
  },
  {
    rule: "Store migrations per engine in parallel version directories.",
    rationale: "Version alignment must remain explicit even when SQL differs by dialect."
  },
  {
    rule: "Declare capability assumptions before using JSON, computed columns, or engine functions.",
    rationale: "Cross-engine drift is usually hidden in advanced schema features."
  },
  {
    rule: "Keep destructive and irreversible changes isolated from mixed-purpose migrations.",
    rationale: "Rollback and safety characteristics vary materially between supported engines."
  }
] as const;

export function getEngineProfile(engine: DatabaseEngine): EngineProfile {
  const profile = engineProfiles.find((entry) => entry.engine === engine);

  if (!profile) {
    throw new Error(`Unsupported database engine: ${engine}`);
  }

  return profile;
}
