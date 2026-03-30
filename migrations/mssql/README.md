# Microsoft SQL Server Migrations

This directory contains SQL Server-specific migration variants aligned to the shared InfraLynx migration version stream.

Document every behavioral deviation from the PostgreSQL reference migration before implementation.

Current performance baseline:

- `0030_query_optimization_indexes.sql` defines the SQL Server variant of the shared index strategy.
