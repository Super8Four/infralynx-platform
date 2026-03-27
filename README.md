# infralynx-platform

InfraLynx application monorepo for product runtime code, shared libraries, test harnesses, migrations, and deployment-facing application assets.

## Repository Structure

- `apps/web` for the user-facing application shell
- `apps/api` for the HTTP API service
- `apps/worker` for background jobs and asynchronous processing
- `packages/config` for shared configuration helpers
- `packages/core-domain` for core platform entities and RBAC-friendly contracts
- `packages/auth` for authentication sessions and authorization policy scaffolds
- `packages/audit` for audit record contracts and append-only event helpers
- `packages/db-abstraction` for database capability mapping and migration contracts
- `packages/dcim-domain` for physical infrastructure, rack, interface, power, and cabling contracts
- `packages/domain-core` for core platform contracts and boundaries
- `packages/ipam-domain` for VRF, prefix, IP address, VLAN, and allocation contracts
- `packages/job-core` for job lifecycle, retry, logging, and audit-aware job contracts
- `packages/job-queue` for queue abstractions and file-backed queue state
- `packages/media-core` for media metadata, validation, linking, and access-control contracts
- `packages/media-storage` for local-first media object storage adapters
- `packages/network-domain` for explicit bindings across interfaces, IPs, VLANs, cables, and prefix hierarchy
- `packages/data-transfer` for import/export schema contracts, validation, and transfer-state orchestration
- `packages/ui` for shell navigation, tokens, and shared frontend composition contracts
- `packages/shared` for cross-cutting utilities that are safe to reuse
- `tests` for cross-workspace test organization
- `migrations` for database-engine migration structure
- `deploy` for application deployment-facing assets

## Current Status

The current baseline includes CI validation and database-abstraction design scaffolding, but does not yet implement runtime data access or engine-specific drivers.
