import { UTApi, UTFile } from "uploadthing/server";
import type { Env } from "../../env.js";

export interface StorageAdapter {
  uploadObject(key: string, body: Buffer, contentType: string): Promise<string>;
}

class LocalDevStorage implements StorageAdapter {
  async uploadObject(key: string) {
    return `https://placehold.co/600x600/e8f5e9/1b5e20?text=${encodeURIComponent(key.slice(0, 12))}`;
  }
}

class UploadThingStorage implements StorageAdapter {
  private readonly utapi: UTApi;

  constructor(token: string) {
    this.utapi = new UTApi({ token });
  }

  async uploadObject(key: string, body: Buffer, contentType: string) {
    const file = new UTFile([new Uint8Array(body)], key, { type: contentType });
    const { data, error } = await this.utapi.uploadFiles(file);
    if (error) {
      throw new Error(`UploadThing upload failed: ${error.message}`);
    }
    return data.ufsUrl;
  }
}

export function createStorageAdapter(env: Env): StorageAdapter {
  if (env.UPLOADTHING_TOKEN) {
    return new UploadThingStorage(env.UPLOADTHING_TOKEN);
  }
  return new LocalDevStorage();
}
