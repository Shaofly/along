import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const supportedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function storedPath(storageKey: string) {
  return path.join(".data", "uploads", storageKey);
}

export async function saveImage(file: File, ownerId: string) {
  if (!supportedTypes.has(file.type)) {
    throw new Error("目前支持 JPG、PNG、WebP 和手机 HEIC 图片。");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("单张图片不能超过 12 MB。");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const outputType = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpeg";
  const pipeline = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({
      width: 2560,
      height: 2560,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb");
  const bytes =
    outputType === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : outputType === "webp"
        ? await pipeline.webp({ quality: 88 }).toBuffer()
        : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const extension = outputType === "jpeg" ? "jpg" : outputType;
  const mimeType = outputType === "jpeg" ? "image/jpeg" : `image/${outputType}`;

  const now = new Date();
  const storageKey = path.join(
    ownerId,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.${extension}`,
  );
  const absolutePath = storedPath(storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(absolutePath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ absolutePath, bytes, { flag: "wx" });

  return { storageKey, mimeType, byteSize: bytes.byteLength };
}

export function readStoredFile(storageKey: string) {
  return readFile(
    /* turbopackIgnore: true */ storedPath(storageKey),
  );
}

export async function deleteStoredFile(storageKey: string) {
  await rm(
    /* turbopackIgnore: true */ storedPath(storageKey),
    { force: true },
  );
}
