# InfraLynx Platform

[![Build](https://github.com/Super8Four/infralynx-platform/actions/workflows/build.yml/badge.svg?style=flat-square)](https://github.com/Super8Four/infralynx-platform/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.12.0--alpha%2Bchunk31.1-E6E1D9?style=flat-square&labelColor=2A3F5F)](VERSION)
[![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![MS%20SQL%20Server](https://img.shields.io/badge/MS%20SQL%20Server-supported-CC2927?style=flat-square&logo=microsoftsqlserver&logoColor=white)](https://www.microsoft.com/sql-server/)
[![MariaDB](https://img.shields.io/badge/MariaDB-supported-003545?style=flat-square&logo=mariadb&logoColor=white)](https://mariadb.org/)
[![Documentation](https://img.shields.io/badge/docs-MkDocs-526CFE?style=flat-square&logo=materialformkdocs&logoColor=white)](https://super8four.github.io/infralynx-docs/)

Modern enterprise DCIM, IPAM, and network infrastructure management platform built with Node.js.

Quick Links: [Documentation](https://super8four.github.io/infralynx-docs/) | [Platform Repo](https://github.com/Super8Four/infralynx-platform) | [Docs Repo](https://github.com/Super8Four/infralynx-docs) | [Standards Repo](https://github.com/Super8Four/infralynx-standards) | [Design Repo](https://github.com/Super8Four/infralynx-design) | [Infra Repo](https://github.com/Super8Four/infralynx-infra)

## Overview

`infralynx-platform` is the runtime and application monorepo for InfraLynx. It contains the API, web application, worker services, shared platform packages, migrations, performance tooling, and the delivery-facing code that turns InfraLynx architecture into a usable product.

This repository is the center of the active platform build. It depends on the docs, standards, design, and infrastructure repositories for policy, guidance, assets, and deployment direction, but it owns the running product surface.

## Current Status

- Repository version: `v0.12.0-alpha+chunk31.1`
- Program snapshot: `v0.1.0-alpha+chunk31`
- Current chunk: `31.1`
- Current phase: `Scale / Reliability`
- Next milestone: `Chunk 32 -> API Versioning`
- Target release: `v1.0.0`

The platform is in active scale, reliability, and contract-hardening work. Core platform, IPAM, DCIM, operations, security, and performance foundations are in place. The current focus is making those surfaces stable for long-term external integration.

## Roadmap Progress

Completed:
- Core platform
- IPAM
- DCIM
- Operations
- Security
- Performance

In Progress:
- Reliability / API hardening

Upcoming:
- Product differentiators
- Visual subnet planning
- Network containers
- AI integrations

## Tech Stack

- Node.js and TypeScript
- React and Vite
- BullMQ and Redis-backed infrastructure services
- PostgreSQL, MS SQL Server, and MariaDB compatibility planning
- MkDocs for project documentation

## Getting Started

1. Install dependencies:

```powershell
npm install
```

2. Build the workspace:

```powershell
npm run build
```

3. Run the API:

```powershell
node apps/api/dist/index.js
```

4. Run the web UI in another terminal:

```powershell
npm --workspace @infralynx/web run dev
```

## Documentation Links

- [Documentation Portal](https://super8four.github.io/infralynx-docs/)
- [Platform Repository Map](https://super8four.github.io/infralynx-docs/engineering/platform-repository/)
- [Onboarding Guide](https://super8four.github.io/infralynx-docs/development/onboarding/)
- [Versioning Strategy](https://super8four.github.io/infralynx-docs/development/versioning/)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Support Policy](SUPPORT.md)

## InfraLynx Repository Ecosystem

- [infralynx-platform](https://github.com/Super8Four/infralynx-platform): product runtime, API, worker, UI, migrations, and shared application packages
- [infralynx-docs](https://github.com/Super8Four/infralynx-docs): official documentation, architecture decisions, operational guides, and API references
- [infralynx-infra](https://github.com/Super8Four/infralynx-infra): infrastructure-as-code, deployment patterns, and hosting configuration
- [infralynx-standards](https://github.com/Super8Four/infralynx-standards): governance, contribution policies, standards, and architectural operating rules
- [infralynx-design](https://github.com/Super8Four/infralynx-design): design system direction, visual language, UX guidance, and shared assets

## Contribution Guidelines

Contributions should follow InfraLynx governance, repository standards, and ADR-driven architectural discipline. Review [CONTRIBUTING.md](CONTRIBUTING.md), [CLA.md](CLA.md), and the standards repository before proposing large changes.

## Support InfraLynx

Support continued development of InfraLynx:

[https://buymeacoffee.com/infralynx](https://buymeacoffee.com/infralynx)

Support helps fund:
- New features
- Documentation
- Hosted services
- Enterprise integrations

## License

InfraLynx Platform is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Support / Community

- [Documentation Site](https://super8four.github.io/infralynx-docs/)
- [Support Policy](SUPPORT.md)
- [Security Reporting](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
