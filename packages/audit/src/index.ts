export interface AuditActor {
  readonly id: string;
  readonly type: "user" | "service-account" | "system";
  readonly tenantId: string | null;
}

export interface AuditRecord {
  readonly id: string;
  readonly occurredAt: string;
  readonly category: "authentication" | "authorization" | "tenant" | "tag" | "status";
  readonly action: string;
  readonly actor: AuditActor;
  readonly targetId: string | null;
  readonly metadata: Record<string, string>;
}

export function createAuditRecord(
  input: Omit<AuditRecord, "id">
): AuditRecord {
  return {
    ...input,
    id: `${input.category}:${input.action}:${input.occurredAt}`
  };
}

export function summarizeAuditRecord(record: AuditRecord): string {
  return `${record.occurredAt} ${record.category}:${record.action} by ${record.actor.type}`;
}
