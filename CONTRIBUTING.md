# Contributing

InfraLynx accepts issues, design feedback, documentation improvements, and code contributions through GitHub.

## Expectations

- Open or reference an issue before substantial implementation work.
- Keep changes scoped to a single objective or chunk when possible.
- Add or update documentation and tests with behavioral changes.
- Preserve explicit domain boundaries and shared contract ownership.
- Follow the repository issue, PR, and review templates.

## Development Standard

- Use the documented service and package boundaries rather than cross-importing domain internals.
- Keep UI concerns separate from API and domain logic.
- Prefer additive changes over hidden behavioral changes.
- Update `CHANGELOG.md` and version references when preparing releases.

## Review And Acceptance

By submitting a contribution, you agree that it may be reviewed, modified, and redistributed under the repository license and the contributor terms in [CLA.md](CLA.md).
