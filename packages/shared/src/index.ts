export interface TenantScopedRecord {
  readonly tenantId: string;
}

export interface LinkedObjectReference {
  readonly objectType: string;
  readonly objectId: string;
}

export function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function formatBanner(title: string, detail: string): string {
  return `${title} :: ${detail}`;
}
