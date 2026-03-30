# infralynx-platform

[![Build](https://github.com/Super8Four/infralynx-platform/actions/workflows/build.yml/badge.svg?style=flat-square)](https://github.com/Super8Four/infralynx-platform/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.11.0--alpha-E6E1D9?style=flat-square&labelColor=2A3F5F)](VERSION)
[![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![MS%20SQL%20Server](https://img.shields.io/badge/MS%20SQL%20Server-supported-CC2927?style=flat-square&logo=microsoftsqlserver&logoColor=white)](https://www.microsoft.com/sql-server/)
[![MariaDB](https://img.shields.io/badge/MariaDB-supported-003545?style=flat-square&logo=mariadb&logoColor=white)](https://mariadb.org/)

InfraLynx application monorepo for product runtime code, shared libraries, test harnesses, migrations, and deployment-facing application assets.

## Repository Structure

- `apps/web` for the user-facing application shell
- `apps/api` for the HTTP API service
- `apps/worker` for background jobs and asynchronous processing
- `packages/config` for shared configuration helpers
- `packages/core-domain` for core platform entities and RBAC-friendly contracts
- `packages/auth-core` for provider-aware authentication state, encrypted config storage, and secure session handling
- `packages/auth-providers/*` for isolated local, LDAP, OIDC, and SAML adapters
- `packages/auth` for compatibility exports into the broader platform surface
- `packages/audit` for audit record contracts and append-only event helpers
- `packages/cache-core` for Redis-backed cache abstraction, TTL policy support, and invalidation helpers
- `packages/data-transfer` for import/export schema contracts, validation, and transfer-state orchestration
- `packages/db-abstraction` for database capability mapping and migration contracts
- `packages/db-performance` for shared pagination, query review contracts, and cross-engine index planning
- `packages/dcim-domain` for physical infrastructure, rack, interface, power, and cabling contracts
- `packages/domain-core` for core platform contracts and boundaries
- `packages/event-core` for explicit event records and dispatch contracts
- `packages/ipam-domain` for VRF, prefix, IP address, VLAN, and allocation contracts
- `packages/job-core` for job lifecycle, retry, logging, and audit-aware job contracts
- `packages/job-queue` for BullMQ-backed queue abstractions and job metadata state
- `packages/media-core` for media metadata, validation, linking, and access-control contracts
- `packages/media-storage` for local-first media object storage adapters behind standard upload handling
- `packages/network-domain` for explicit bindings across interfaces, IPs, VLANs, cables, and prefix hierarchy
- `packages/performance-tests` for shared load-test thresholds, scenario metadata, and stability validation helpers
- `packages/scheduler` for recurring schedule records, cron-backed scheduling, and job-trigger orchestration
- `packages/ui` for shell navigation, tokens, and shared frontend composition contracts
- `packages/webhooks` for webhook registration, signing, and queue-backed axios delivery orchestration
- `packages/shared` for cross-cutting utilities that are safe to reuse
- `tests` for cross-workspace test organization
- `migrations` for database-engine migration structure
- `deploy` for application deployment-facing assets

## Versioning

This repository follows Semantic Versioning. The current public version is stored in [VERSION](VERSION) and is `v0.11.0-alpha`.

Internal progress tracking may add optional build metadata, for example `v0.11.0-alpha+chunk31`, without changing release precedence.

## License

InfraLynx Platform is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

## Project Files

- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CLA.md](CLA.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
