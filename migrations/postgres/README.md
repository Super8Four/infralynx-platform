# PostgreSQL Migrations

PostgreSQL is the reference engine for InfraLynx schema behavior.

Use this directory for PostgreSQL-specific SQL and migration manifests that define the canonical version path for other engines to follow.

Current performance baseline:

- `0030_query_optimization_indexes.sql` defines the shared index strategy reference implementation.
