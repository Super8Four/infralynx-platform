import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { resolveAccessDecision, type AccessDecision, type AuthIdentity } from "../../auth/dist/index.js";
import {
  defaultCoreRoles,
  isLinkableObjectType,
  type LinkableObjectType,
  type ObjectAssociationReference,
  type RoleDefinition
} from "../../core-domain/dist/index.js";
import { sanitizeFilename, type LinkedObjectReference } from "../../shared/dist/index.js";

export type MediaPermission = "media:read" | "media:write" | "media:delete" | "media:assign";

export interface MediaRecord {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly storagePath: string;
  readonly tenantId: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface MediaLinkRecord {
  readonly mediaId: string;
  readonly objectType: LinkableObjectType;
  readonly objectId: string;
}

export interface MediaUploadRequest {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly tenantId: string;
  readonly createdBy: string;
  readonly associations: readonly ObjectAssociationReference[];
}

export type MediaAccessContext = AuthIdentity;

export interface MediaValidationResult {
  readonly valid: boolean;
  readonly reason: string;
}

export interface MediaMetadataRepository {
  saveMedia(record: MediaRecord): MediaRecord;
  saveLinks(links: readonly MediaLinkRecord[]): readonly MediaLinkRecord[];
  getMediaById(mediaId: string): MediaRecord | null;
  listLinksByMediaId(mediaId: string): readonly MediaLinkRecord[];
  listMediaByObject(
    objectType: LinkableObjectType,
    objectId: string,
    tenantId: string
  ): readonly MediaRecord[];
}

interface FileBackedMediaState {
  readonly media: readonly MediaRecord[];
  readonly links: readonly MediaLinkRecord[];
}

const EMPTY_STATE: FileBackedMediaState = {
  media: [],
  links: []
};

export const mediaUploadConstraints = {
  maxBytes: 10 * 1024 * 1024,
  allowedContentTypes: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain"
  ]
} as const;

export class FileBackedMediaMetadataRepository implements MediaMetadataRepository {
  readonly #metadataFilePath: string;
  #loadedState: FileBackedMediaState | null = null;

  constructor(metadataFilePath: string) {
    this.#metadataFilePath = metadataFilePath;
  }

  saveMedia(record: MediaRecord): MediaRecord {
    const state = this.#loadState();
    const nextState = {
      media: [...state.media, record],
      links: state.links
    };

    this.#persistState(nextState);

    return record;
  }

  saveLinks(links: readonly MediaLinkRecord[]): readonly MediaLinkRecord[] {
    const state = this.#loadState();
    const nextState = {
      media: state.media,
      links: [...state.links, ...links]
    };

    this.#persistState(nextState);

    return links;
  }

  getMediaById(mediaId: string): MediaRecord | null {
    return this.#loadState().media.find((record) => record.id === mediaId) ?? null;
  }

  listLinksByMediaId(mediaId: string): readonly MediaLinkRecord[] {
    return this.#loadState().links.filter((link) => link.mediaId === mediaId);
  }

  listMediaByObject(
    objectType: LinkableObjectType,
    objectId: string,
    tenantId: string
  ): readonly MediaRecord[] {
    const state = this.#loadState();
    const mediaIds = new Set(
      state.links
        .filter((link) => link.objectType === objectType && link.objectId === objectId)
        .map((link) => link.mediaId)
    );

    return state.media.filter((record) => mediaIds.has(record.id) && record.tenantId === tenantId);
  }

  #loadState(): FileBackedMediaState {
    if (this.#loadedState) {
      return this.#loadedState;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.#metadataFilePath, "utf8")) as FileBackedMediaState;
      this.#loadedState = {
        media: parsed.media ?? [],
        links: parsed.links ?? []
      };
    } catch {
      this.#loadedState = EMPTY_STATE;
    }

    return this.#loadedState;
  }

  #persistState(state: FileBackedMediaState) {
    mkdirSync(dirname(this.#metadataFilePath), { recursive: true });
    writeFileSync(this.#metadataFilePath, JSON.stringify(state, null, 2));
    this.#loadedState = state;
  }
}

export function createMediaId(): string {
  return `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateMediaUpload(request: MediaUploadRequest): MediaValidationResult {
  if (sanitizeFilename(request.filename).length === 0) {
    return { valid: false, reason: "filename must contain at least one supported character" };
  }

  if (
    !mediaUploadConstraints.allowedContentTypes.some(
      (contentType) => contentType === request.contentType
    )
  ) {
    return { valid: false, reason: "content type is not allowed by the current upload policy" };
  }

  if (!Number.isInteger(request.size) || request.size <= 0) {
    return { valid: false, reason: "file size must be a positive integer" };
  }

  if (request.size > mediaUploadConstraints.maxBytes) {
    return {
      valid: false,
      reason: `file size exceeds the ${mediaUploadConstraints.maxBytes} byte upload limit`
    };
  }

  for (const association of request.associations) {
    if (!isLinkableObjectType(association.objectType)) {
      return { valid: false, reason: `unsupported association type ${association.objectType}` };
    }

    if (association.objectId.trim().length === 0) {
      return { valid: false, reason: "association object IDs must not be empty" };
    }
  }

  return { valid: true, reason: "upload request satisfies current media validation rules" };
}

export function enforceTenantIsolation(
  context: MediaAccessContext,
  tenantId: string
): MediaValidationResult {
  if (context.tenantId !== tenantId) {
    return { valid: false, reason: "tenant isolation blocked cross-tenant media access" };
  }

  return { valid: true, reason: "tenant isolation passed" };
}

export function resolveMediaAccess(
  context: MediaAccessContext,
  permission: MediaPermission,
  roles: readonly RoleDefinition[] = defaultCoreRoles
): AccessDecision {
  return resolveAccessDecision(context, roles, permission);
}

export function createMediaRecord(input: {
  readonly id?: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly storagePath: string;
  readonly tenantId: string;
  readonly createdBy: string;
  readonly createdAt?: string;
}): MediaRecord {
  return {
    id: input.id ?? createMediaId(),
    filename: sanitizeFilename(input.filename),
    contentType: input.contentType,
    size: input.size,
    storagePath: input.storagePath,
    tenantId: input.tenantId,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function createMediaLinks(
  mediaId: string,
  associations: readonly LinkedObjectReference[]
): readonly MediaLinkRecord[] {
  return associations
    .filter((association): association is ObjectAssociationReference =>
      isLinkableObjectType(association.objectType)
    )
    .map((association) => ({
      mediaId,
      objectType: association.objectType,
      objectId: association.objectId
    }));
}

export function describeMediaRecord(record: MediaRecord, links: readonly MediaLinkRecord[]): string {
  return `${record.filename} (${record.contentType}, ${record.size} bytes) linked to ${links.length} objects`;
}

export function createFileBackedMediaRepository(metadataFilePath: string) {
  return new FileBackedMediaMetadataRepository(metadataFilePath);
}
