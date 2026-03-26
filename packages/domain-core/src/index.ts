export const coreDomains = [
  "authentication",
  "rbac",
  "tenants",
  "tagging",
  "statuses",
  "audit-logging",
  "notifications"
] as const;

export const platformBoundaries = {
  api: "request/response orchestration and contract exposure",
  worker: "background execution, asynchronous workflows, and integrations",
  web: "operator-facing interface composition and navigation"
} as const;
