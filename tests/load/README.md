# Load Testing

InfraLynx uses Artillery for bootstrap load and stability validation.

Scenarios cover:

- API read concurrency on hot endpoints
- concurrent session creation and refresh
- job enqueue saturation through the jobs API

Current baseline notes:

- the platform still uses bootstrap file-backed persistence for several subsystems
- database connection pool validation is modeled as a documented baseline until live DB adapters land
- load tests identify regressions and bottlenecks before the persistent database layer is introduced

Use:

- `npm run test:load:smoke` for a fast local validation pass
- `npm run test:load` for the baseline suite
