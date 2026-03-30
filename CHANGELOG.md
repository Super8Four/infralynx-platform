# Changelog

All notable changes to this repository will be documented in this file.

## [v0.12.0-alpha+chunk31.1]

### Added
- Enterprise-grade README structure with ecosystem navigation, roadmap progress, support links, and repository quick links.

### Changed
- Standardized badges, status framing, and repository presentation to align with the full InfraLynx ecosystem.
- Updated the repository status snapshot to explicitly show current chunk progress and next milestone context.

### Fixed
- Removed drift between the platform repository presentation and the rest of the InfraLynx public repository surface.

### Removed
- None.

## [v0.12.0-alpha]

### Added
- Shared `@infralynx/api-contracts` package for versioned path helpers, Zod schemas, standard API metadata, and error envelopes.
- `/api/v1` routing layer with centralized query/body validation for core read, auth, inventory, and job entrypoints.
- Version-aware API response normalization with standardized JSON metadata and legacy deprecation headers on unversioned `/api/*` routes.

### Changed
- Updated the platform release baseline to `v0.12.0-alpha`.
- Moved web-client and load-test traffic to `/api/v1/*` while retaining legacy compatibility for existing integrations.

### Fixed
- Closed the gap where InfraLynx exposed unversioned contracts and inconsistent error payloads across the API surface.

### Removed
- None.

## [v0.11.0-alpha]

### Added
- Shared `@infralynx/performance-tests` package for deterministic load scenario definitions, thresholds, and reporting metadata.
- Artillery-based load scenarios under `tests/load` covering API concurrency, concurrent session handling, and job enqueue saturation.
- Executable load-test runner scripts `npm run test:load` and `npm run test:load:smoke` for local and CI-friendly stability validation.

### Changed
- Updated the platform release baseline to `v0.11.0-alpha`.
- Extended the repository structure and versioning guidance to include automated load and stability validation.

### Fixed
- Closed the gap where InfraLynx had no repeatable, repository-owned framework for detecting API and background-processing regressions under concurrent pressure.

### Removed
- None.

## [v0.10.0-alpha]

### Added
- Shared `@infralynx/db-performance` package for deterministic pagination, query review metadata, explain-plan guidance, and cross-engine index definitions.
- Engine-specific index migration baselines for PostgreSQL, MSSQL, and MariaDB under `migrations/*/0030_query_optimization_indexes.sql`.
- Search pagination metadata and standardized pagination metadata on inventory list responses.

### Changed
- Updated the platform release baseline to `v0.10.0-alpha`.
- Standardized list-query pagination and sort handling on inventory and search endpoints through shared performance helpers.

### Fixed
- Removed drift between API list endpoints that were previously using ad hoc pagination parsing and unstable same-value sort behavior.

### Removed
- None.

## [v0.9.0-alpha]

### Added
- Centralized Redis-backed cache abstraction with mock-Redis fallback for local and test environments.
- API cache helpers for scoped response caching, request-identity caching, and explicit invalidation by subsystem prefix.
- Cache status endpoint and targeted caching across overview, search, inventory, auth, and RBAC read surfaces.

### Changed
- Updated the platform release baseline to `v0.9.0-alpha`.
- Added write-path invalidation for inventory, auth-provider, session, and RBAC mutations so cached reads stay synchronized.

### Fixed
- Reduced repeated recomputation of hot API responses and repeated bearer-session resolution on admin and CRUD-heavy paths.

### Removed
- None.

## [v0.8.0-alpha]

### Added
- Centralized backup package with compressed full and partial runtime-state backups plus restore preview and rollback-safe restore execution.
- Backup API routes for backup creation, restore validation, restore execution, backup inspection, and backup scheduling integration.
- Worker support for asynchronous `backup.create` jobs so scheduled or deferred backups run through the existing job engine.

### Changed
- Updated the platform release baseline to `v0.8.0-alpha`.
- Extended RBAC with `backup:read`, `backup:write`, and `backup:restore` permissions for controlled data-safety operations.

### Fixed
- Closed the gap where InfraLynx had no centralized, validated recovery path for the current persisted platform state.

### Removed
- None.

## [v0.7.0-alpha]

### Added
- Centralized validation package with IPAM overlap detection, prefix hierarchy checks, and DCIM relationship validation.
- Validation API route for dry-run inventory mutation checks before writes or approval requests.
- Workflow integration for change-control requests so approval candidates can be validated before entering review.

### Changed
- Updated the platform release baseline to `v0.7.0-alpha`.
- Enforced conflict detection in the inventory write path so invalid overlaps and broken references are rejected before persistence.

### Fixed
- Closed the gap where structurally valid inventory payloads could still introduce overlapping prefixes, duplicate IPs, or broken cross-domain references.

### Removed
- None.

## [v0.6.0-alpha]

### Added
- Approval workflow foundation with centralized request records, status transitions, assignee targeting, and approval APIs.
- Workflow UI workspace for creating, reviewing, approving, and rejecting requests.
- Job-engine integration so approved executable requests enqueue normal background jobs instead of introducing a second execution path.

### Changed
- Updated the platform release baseline to `v0.6.0-alpha`.
- Extended RBAC with workflow read, write, and approve permissions so approval routing is enforced at the API layer.

### Fixed
- Closed the gap where high-impact queued actions could be requested without an explicit approval record.

### Removed
- None.

## [v0.5.0-alpha]

### Added
- Centralized structured audit repository with append-only JSON records and query helpers.
- Audit API endpoints for filtered audit reads.
- System-wide audit hooks across authentication, inventory mutations, jobs, webhooks, and RBAC administration.

### Changed
- Updated the platform release baseline to `v0.5.0-alpha`.
- Promoted job and webhook activity into the shared audit trail instead of leaving them in subsystem-local logs only.

### Fixed
- Closed the gap where major control-plane mutations were not represented in a centralized audit stream.

### Removed
- None.

## [v0.4.0-alpha]

### Added
- Scoped RBAC contracts for permissions, role assignments, provider-role mappings, and scope-aware grant evaluation.
- RBAC API endpoints for permission summaries, role assignments, and provider mappings.
- Admin RBAC workspace in the web app for managing assignments and external-provider mappings.

### Changed
- Updated the platform release baseline to `v0.4.0-alpha`.
- Extended auth session handling so provider logins can resolve external groups and claims into InfraLynx role assignments.
- Applied API-side permission enforcement to the current inventory surface and UI-side route/action gating from session permissions.

### Fixed
- Replaced coarse role-only authorization checks with scope-aware permission decisions for the active CRUD surfaces.

### Removed
- None.

## [v0.3.0-alpha]

### Added
- BullMQ-backed queue integration with Redis or local mock-Redis connection wrapping.
- Node-cron-backed scheduler runtime, axios webhook delivery, multer upload parsing, and React Flow topology rendering.
- External-library alignment across auth, jobs, scheduling, webhooks, media handling, and topology visualization.

### Changed
- Promoted the platform version baseline from `v0.2.0-alpha` to `v0.3.0-alpha`.
- Replaced custom infrastructure adapters with wrapped third-party libraries while preserving InfraLynx service abstractions.

### Fixed
- Eliminated custom password hashing, LDAP transport, SAML engine, webhook HTTP transport, and topology canvas rendering paths for solved infrastructure concerns.

### Removed
- Direct reliance on `bcryptjs`, `ldapts`, and the prior custom SVG-only topology renderer.

## [v0.2.0-alpha]

### Added
- Multi-provider authentication service with local, LDAP, OIDC, and SAML provider abstractions.
- Secure JWT session issuance, refresh, logout, encrypted provider config storage, and admin auth provider UI.
- Dedicated auth API routes for provider management, login flows, callback handling, and session status.

### Changed
- Promoted the platform version baseline from `v0.1.0-alpha` to `v0.2.0-alpha`.
- Expanded navigation and RBAC contracts to include admin authentication management.

### Fixed
- Replaced the earlier header-only auth shim with a persistent auth core that supports fallback local admin access.

### Removed
- None.

## [v0.1.0-alpha]

### Added
- Initial InfraLynx platform monorepo foundation, domain scaffolds, UI shell, integration services, job engine, and webhook/event baseline.

### Changed
- Established Semantic Versioning with optional internal build metadata such as `v0.1.0-alpha+chunk21`.

### Fixed
- None.

### Removed
- Private commercial license placeholder.
