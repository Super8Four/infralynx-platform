import { mkdirSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";

import multer from "multer";

import {
  isLinkableObjectType,
  type ObjectAssociationReference
} from "../../../../packages/core-domain/dist/index.js";
import {
  createFileBackedMediaRepository,
  createMediaLinks,
  createMediaRecord,
  describeMediaRecord,
  enforceTenantIsolation,
  resolveMediaAccess,
  validateMediaUpload,
  type MediaAccessContext
} from "../../../../packages/media-core/dist/index.js";
import { createLocalMediaStorage } from "../../../../packages/media-storage/dist/index.js";

export interface ApiMediaResponse {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly tenantId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly links: readonly {
    readonly objectType: string;
    readonly objectId: string;
  }[];
  readonly contentUrl: string;
  readonly description: string;
}

interface UploadMediaPayload {
  readonly filename: string;
  readonly contentType: string;
  readonly contentBase64: string;
  readonly tenantId: string;
  readonly associations?: readonly ObjectAssociationReference[];
}

interface MultipartUploadRequest extends IncomingMessage {
  file?: {
    readonly originalname: string;
    readonly mimetype: string;
    readonly buffer: Buffer;
    readonly size: number;
  };
  body: Record<string, string>;
}

const mediaRootDirectory = resolve(process.cwd(), "apps/api/media-data");
const mediaObjectsDirectory = resolve(mediaRootDirectory, "objects");
const mediaMetadataFile = resolve(mediaRootDirectory, "metadata/media.json");

mkdirSync(dirname(mediaMetadataFile), { recursive: true });
mkdirSync(mediaObjectsDirectory, { recursive: true });

const mediaRepository = createFileBackedMediaRepository(mediaMetadataFile);
const mediaStorage = createLocalMediaStorage(mediaObjectsDirectory);
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
}).single("file");

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(payload));
}

function sendBinary(response: ServerResponse, statusCode: number, contentType: string, body: Uint8Array) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": String(body.byteLength),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(body);
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

function parseMultipartUpload(
  request: IncomingMessage,
  response: ServerResponse
): Promise<MultipartUploadRequest> {
  return new Promise((resolveUpload, rejectUpload) => {
    (uploadMiddleware as any)(request, response, (error: unknown) => {
      if (error) {
        rejectUpload(error);
        return;
      }

      resolveUpload(request as MultipartUploadRequest);
    });
  });
}

function createContextFromHeaders(request: IncomingMessage): MediaAccessContext | null {
  const actorId = request.headers["x-infralynx-actor-id"];
  const tenantId = request.headers["x-infralynx-tenant-id"];
  const roleIdsHeader = request.headers["x-infralynx-role-ids"];

  if (
    typeof actorId !== "string" ||
    typeof tenantId !== "string" ||
    typeof roleIdsHeader !== "string"
  ) {
    return null;
  }

  return {
    id: actorId,
    subject: actorId,
    tenantId,
    method: "api-token",
    roleIds: roleIdsHeader
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

function requirePermission(
  response: ServerResponse,
  context: MediaAccessContext | null,
  permission: Parameters<typeof resolveMediaAccess>[1],
  tenantId?: string
): context is MediaAccessContext {
  if (!context) {
    sendJson(response, 401, {
      error: {
        code: "missing_identity",
        message: "media endpoints require actor, tenant, and role headers"
      }
    });

    return false;
  }

  const decision = resolveMediaAccess(context, permission);

  if (!decision.allowed) {
    sendJson(response, 403, {
      error: {
        code: "forbidden",
        message: decision.reason
      }
    });

    return false;
  }

  if (tenantId) {
    const isolation = enforceTenantIsolation(context, tenantId);

    if (!isolation.valid) {
      sendJson(response, 403, {
        error: {
          code: "tenant_isolation_violation",
          message: isolation.reason
        }
      });

      return false;
    }
  }

  return true;
}

function mapMediaResponse(recordId: string, host: string): ApiMediaResponse | null {
  const record = mediaRepository.getMediaById(recordId);

  if (!record) {
    return null;
  }

  const links = mediaRepository.listLinksByMediaId(recordId);

  return {
    id: record.id,
    filename: record.filename,
    contentType: record.contentType,
    size: record.size,
    tenantId: record.tenantId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    links: links.map((link) => ({
      objectType: link.objectType,
      objectId: link.objectId
    })),
    contentUrl: `http://${host}/api/media/${record.id}/content`,
    description: describeMediaRecord(record, links)
  };
}

async function handleUpload(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  context: MediaAccessContext | null
) {
  if (!requirePermission(response, context, "media:write")) {
    return;
  }

  let payload: UploadMediaPayload;
  let decodedContent: Buffer;

  if ((request.headers["content-type"] ?? "").includes("multipart/form-data")) {
    let multipartRequest: MultipartUploadRequest;

    try {
      multipartRequest = await parseMultipartUpload(request, response);
    } catch (error) {
      sendJson(response, 400, {
        error: {
          code: "invalid_upload",
          message: error instanceof Error ? error.message : "multipart upload parsing failed"
        }
      });

      return;
    }

    if (!multipartRequest.file) {
      sendJson(response, 400, {
        error: {
          code: "missing_file",
          message: "multipart uploads must include a file field"
        }
      });

      return;
    }

    payload = {
      filename: multipartRequest.file.originalname,
      contentType: multipartRequest.file.mimetype,
      contentBase64: multipartRequest.file.buffer.toString("base64"),
      tenantId: multipartRequest.body["tenantId"] ?? "",
      associations:
        typeof multipartRequest.body["associations"] === "string" && multipartRequest.body["associations"].trim().length > 0
          ? (JSON.parse(multipartRequest.body["associations"]) as readonly ObjectAssociationReference[])
          : []
    };
    decodedContent = multipartRequest.file.buffer;
  } else {
    try {
      payload = JSON.parse(await readRequestBody(request)) as UploadMediaPayload;
    } catch {
      sendJson(response, 400, {
        error: {
          code: "invalid_json",
          message: "upload requests must provide valid JSON payloads"
        }
      });

      return;
    }

    decodedContent = Buffer.from(payload.contentBase64, "base64");
  }

  if (!requirePermission(response, context, "media:write", payload.tenantId)) {
    return;
  }

  const associations = payload.associations ?? [];
  const uploadValidation = validateMediaUpload({
    filename: payload.filename,
    contentType: payload.contentType,
    size: decodedContent.byteLength,
    tenantId: payload.tenantId,
    createdBy: context.id,
    associations
  });

  if (!uploadValidation.valid) {
    sendJson(response, 400, {
      error: {
        code: "invalid_upload",
        message: uploadValidation.reason
      }
    });

    return;
  }

  if (associations.length > 0 && !requirePermission(response, context, "media:assign", payload.tenantId)) {
    return;
  }

  const mediaRecordBase = createMediaRecord({
    filename: payload.filename,
    contentType: payload.contentType,
    size: decodedContent.byteLength,
    storagePath: "",
    tenantId: payload.tenantId,
    createdBy: context.id
  });
  const storedObject = mediaStorage.writeObject({
    mediaId: mediaRecordBase.id,
    tenantId: payload.tenantId,
    filename: payload.filename,
    content: decodedContent
  });
  const mediaRecord = {
    ...mediaRecordBase,
    storagePath: storedObject.storagePath
  };

  mediaRepository.saveMedia(mediaRecord);
  mediaRepository.saveLinks(createMediaLinks(mediaRecord.id, associations));

  sendJson(response, 201, {
    media: mapMediaResponse(mediaRecord.id, request.headers.host ?? requestUrl.host)
  });
}

function handleReadMetadata(
  response: ServerResponse,
  requestUrl: URL,
  context: MediaAccessContext | null,
  mediaId: string
) {
  const record = mediaRepository.getMediaById(mediaId);

  if (!record) {
    sendJson(response, 404, {
      error: {
        code: "media_not_found",
        message: `no media object matched ${mediaId}`
      }
    });

    return;
  }

  if (!requirePermission(response, context, "media:read", record.tenantId)) {
    return;
  }

  sendJson(response, 200, {
    media: mapMediaResponse(mediaId, requestUrl.host)
  });
}

function handleReadContent(
  response: ServerResponse,
  context: MediaAccessContext | null,
  mediaId: string
) {
  const record = mediaRepository.getMediaById(mediaId);

  if (!record) {
    sendJson(response, 404, {
      error: {
        code: "media_not_found",
        message: `no media object matched ${mediaId}`
      }
    });

    return;
  }

  if (!requirePermission(response, context, "media:read", record.tenantId)) {
    return;
  }

  sendBinary(response, 200, record.contentType, mediaStorage.readObject(record.storagePath));
}

function handleLinkedLookup(
  response: ServerResponse,
  requestUrl: URL,
  context: MediaAccessContext | null
) {
  const objectType = requestUrl.searchParams.get("objectType");
  const objectId = requestUrl.searchParams.get("objectId");
  const tenantId = requestUrl.searchParams.get("tenantId");

  if (!objectType || !objectId || !tenantId) {
    sendJson(response, 400, {
      error: {
        code: "invalid_link_query",
        message: "objectType, objectId, and tenantId are required query parameters"
      }
    });

    return;
  }

  if (!requirePermission(response, context, "media:read", tenantId)) {
    return;
  }

  if (!isLinkableObjectType(objectType)) {
    sendJson(response, 400, {
      error: {
        code: "invalid_object_type",
        message: `${objectType} is not a supported link target`
      }
    });

    return;
  }

  const media = mediaRepository
    .listMediaByObject(objectType, objectId, tenantId)
    .map((record) => mapMediaResponse(record.id, requestUrl.host))
    .filter((item): item is ApiMediaResponse => item !== null);

  sendJson(response, 200, {
    object: {
      objectType,
      objectId,
      tenantId
    },
    media
  });
}

export async function handleMediaApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const context = createContextFromHeaders(request);

  if (request.method === "OPTIONS" && requestUrl.pathname.startsWith("/api/media")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-InfraLynx-Actor-Id, X-InfraLynx-Tenant-Id, X-InfraLynx-Role-Ids"
    });
    response.end();

    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/media/upload") {
    await handleUpload(request, response, requestUrl, context);

    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/media/linked") {
    handleLinkedLookup(response, requestUrl, context);

    return true;
  }

  const metadataMatch = requestUrl.pathname.match(/^\/api\/media\/([^/]+)$/);

  if (request.method === "GET" && metadataMatch) {
    handleReadMetadata(response, requestUrl, context, metadataMatch[1]);

    return true;
  }

  const contentMatch = requestUrl.pathname.match(/^\/api\/media\/([^/]+)\/content$/);

  if (request.method === "GET" && contentMatch) {
    handleReadContent(response, context, contentMatch[1]);

    return true;
  }

  return false;
}
