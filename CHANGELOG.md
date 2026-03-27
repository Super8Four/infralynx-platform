# Changelog

All notable changes to this repository will be documented in this file.

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
