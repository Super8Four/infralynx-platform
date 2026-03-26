# Contributing to InfraLynx

## Workflow

- All shared branches use pull requests only.
- No direct commits to `main` or `develop`.
- Work must be scoped to one logical chunk, issue, or bugfix.
- Documentation must be updated with the change when behavior, process, or architecture changes.
- Architectural decisions require a new ADR or a status update to an existing ADR.

## Branching Strategy

- `main` for production-ready releases
- `develop` for integration
- `release/*` for release stabilization
- `hotfix/*` for urgent production remediation
- `domain/*` for temporary domain coordination branches
- `feature/*` for feature delivery
- `bugfix/*` for defect remediation

## Pull Request Usage

- Use the appropriate PR template for feature, fix, hotfix, or docs work.
- Link the issue, epic, and ADR when applicable.
- Document included scope, excluded scope, risks, and validation evidence.
- Keep unrelated changes out of the PR.

## Issue Usage

- Use issue templates for feature, bug, epic, task, security, and docs intake.
- Apply domain and priority labels consistently.
- Break large work into smaller child tasks before implementation begins.

## Review Expectations

- Protected branches require successful checks and approvals before merge.
- CODEOWNERS review is required where ownership rules apply.
- Reviewers should prioritize correctness, scope control, and maintainability.
