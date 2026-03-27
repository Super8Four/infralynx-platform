import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { sanitizeFilename } from "../../shared/dist/index.js";

export interface WriteMediaObjectInput {
  readonly mediaId: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly content: Uint8Array;
}

export interface StoredMediaObject {
  readonly storagePath: string;
  readonly bytesWritten: number;
}

export interface MediaStorageAdapter {
  writeObject(input: WriteMediaObjectInput): StoredMediaObject;
  readObject(storagePath: string): Uint8Array;
}

export class LocalMediaStorageAdapter implements MediaStorageAdapter {
  readonly #rootDirectory: string;

  constructor(rootDirectory: string) {
    this.#rootDirectory = rootDirectory;
  }

  writeObject(input: WriteMediaObjectInput): StoredMediaObject {
    const storagePath = join(
      input.tenantId,
      `${input.mediaId}-${sanitizeFilename(input.filename)}`
    );
    const absolutePath = join(this.#rootDirectory, storagePath);

    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, input.content);

    return {
      storagePath,
      bytesWritten: input.content.byteLength
    };
  }

  readObject(storagePath: string): Uint8Array {
    return readFileSync(join(this.#rootDirectory, storagePath));
  }
}

export function createLocalMediaStorage(rootDirectory: string) {
  return new LocalMediaStorageAdapter(rootDirectory);
}
