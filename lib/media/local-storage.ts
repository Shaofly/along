import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ObjectStorage } from "@/lib/media/contracts";
import { privateDataRoot } from "@/lib/private-data-root";

function localPath(storageKey: string) {
  const normalized = path.posix.normalize(storageKey);
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
    throw new Error("非法媒体存储路径。");
  }
  return path.join(privateDataRoot(), "media", normalized);
}

export class LocalPrivateStorage implements ObjectStorage {
  async put(storageKey: string, bytes: Buffer) {
    const absolutePath = localPath(storageKey);
    await mkdir(/* turbopackIgnore: true */ path.dirname(absolutePath), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ absolutePath, bytes, { flag: "wx" });
    return {
      storageKey,
      byteSize: bytes.byteLength,
      etag: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  read(storageKey: string) {
    return readFile(/* turbopackIgnore: true */ localPath(storageKey));
  }

  async delete(storageKey: string) {
    await rm(/* turbopackIgnore: true */ localPath(storageKey), { force: true });
  }
}
