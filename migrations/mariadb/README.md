# MariaDB Migrations

This directory contains MariaDB-specific migration variants aligned to the shared InfraLynx migration version stream.

Schema changes must be written defensively where DDL rollback or JSON semantics differ from the PostgreSQL reference engine.

Current performance baseline:

- `0030_query_optimization_indexes.sql` defines the MariaDB variant of the shared index strategy.
