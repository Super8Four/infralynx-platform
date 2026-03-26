# Database Migrations

InfraLynx stores schema changes per supported engine so version intent stays aligned even when SQL differs.

## Engine Directories

- `migrations/postgres`
- `migrations/mssql`
- `migrations/mariadb`

## Rules

- version numbers must stay aligned across engines
- reference behavior is designed against PostgreSQL first
- engine-specific SQL must be isolated to engine directories
- unsupported features must be documented before they are used
