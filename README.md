# infralynx-platform

InfraLynx application monorepo for product runtime code, shared libraries, test harnesses, migrations, and deployment-facing application assets.

## Repository Structure

- `apps/web` for the user-facing application shell
- `apps/api` for the HTTP API service
- `apps/worker` for background jobs and asynchronous processing
- `packages/config` for shared configuration helpers
- `packages/domain-core` for core platform contracts and boundaries
- `packages/shared` for cross-cutting utilities that are safe to reuse
- `tests` for cross-workspace test organization
- `migrations` for database-engine migration structure
- `deploy` for application deployment-facing assets

## Current Status

Chunk 4 establishes the monorepo foundation only. It provides a buildable TypeScript workspace structure and explicit domain separation without starting feature implementation.
