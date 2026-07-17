import "server-only";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, eq, gt, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  mediaAssets,
  draftMedia,
  mediaProcessingJobs,
  mediaUploadSessions,
  mediaVariants,
  posts,
  postMedia,
} from "@/db/schema";
import type { MediaVariantType } from "@/lib/media/contracts";
import { LocalSharpProcessor } from "@/lib/media/local-processor";
import { LocalPrivateStorage } from "@/lib/media/local-storage";

const supportedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const localStorage = new LocalPrivateStorage();
const localProcessor = new LocalSharpProcessor();

function safeExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

export async function createLocalUpload(file: File, ownerId: string) {
  if (!supportedTypes.has(file.type)) {
    throw new Error("目前支持 JPG、PNG、WebP 和手机 HEIC 图片。");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("单张图片不能超过 12 MB。");
  }

  const mediaId = randomUUID();
  const uploadSessionId = randomUUID();
  const jobId = randomUUID();
  const incomingKey = path.posix.join(
    "incoming",
    ownerId,
    uploadSessionId,
    `source.${safeExtension(file)}`,
  );
  const input = Buffer.from(await file.arrayBuffer());
  const source = await localProcessor.inspect(input);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await localStorage.put(incomingKey, input);
  await db.transaction(async (transaction) => {
    await transaction.insert(mediaAssets).values({
      id: mediaId,
      ownerId,
      storageKey: incomingKey,
      originalName: file.name.slice(0, 240) || "image",
      mimeType: file.type,
      byteSize: file.size,
      status: "uploaded",
      sourceMimeType: source.mimeType,
      sourceByteSize: file.size,
      sourceWidth: source.width,
      sourceHeight: source.height,
      readyAt: null,
    });
    await transaction.insert(mediaUploadSessions).values({
      id: uploadSessionId,
      mediaId,
      ownerId,
      incomingKey,
      status: "uploaded",
      expectedMimeType: file.type,
      expectedByteSize: file.size,
      expiresAt,
    });
    await transaction.insert(mediaProcessingJobs).values({
      id: jobId,
      mediaId,
      uploadSessionId,
      provider: localProcessor.provider,
      status: "queued",
    });
  });

  return {
    id: mediaId,
    originalName: file.name,
    mimeType: file.type,
    status: "processing" as const,
  };
}

export async function processLocalMedia(mediaId: string) {
  const [context] = await db
    .select({
      mediaId: mediaAssets.id,
      incomingKey: mediaUploadSessions.incomingKey,
      uploadSessionId: mediaUploadSessions.id,
      jobId: mediaProcessingJobs.id,
      jobStatus: mediaProcessingJobs.status,
    })
    .from(mediaAssets)
    .innerJoin(
      mediaUploadSessions,
      eq(mediaUploadSessions.mediaId, mediaAssets.id),
    )
    .innerJoin(
      mediaProcessingJobs,
      eq(mediaProcessingJobs.uploadSessionId, mediaUploadSessions.id),
    )
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!context || context.jobStatus !== "queued") return;

  const writtenKeys: string[] = [];
  try {
    const input = await localStorage.read(context.incomingKey);
    const startedAt = new Date();
    await db.transaction(async (transaction) => {
      await transaction
        .update(mediaAssets)
        .set({ status: "processing", updatedAt: startedAt })
        .where(eq(mediaAssets.id, mediaId));
      await transaction
        .update(mediaUploadSessions)
        .set({ status: "verified", completedAt: startedAt })
        .where(eq(mediaUploadSessions.id, context.uploadSessionId));
      await transaction
        .update(mediaProcessingJobs)
        .set({ status: "processing", attempts: 1, startedAt })
        .where(eq(mediaProcessingJobs.id, context.jobId));
    });

    const processed = await localProcessor.process(input);
    const storedVariants: Array<typeof mediaVariants.$inferInsert> = [];
    for (const variant of processed) {
      const storageKey = path.posix.join(
        "media",
        context.mediaId,
        `${variant.variantType}-${randomUUID()}.${variant.extension}`,
      );
      const stored = await localStorage.put(storageKey, variant.bytes);
      writtenKeys.push(storageKey);
      storedVariants.push({
        mediaId: context.mediaId,
        variantType: variant.variantType,
        storageKey,
        mimeType: variant.mimeType,
        byteSize: stored.byteSize,
        width: variant.width,
        height: variant.height,
        etag: stored.etag,
      });
    }

    const preview = storedVariants.find((variant) => variant.variantType === "preview");
    if (!preview) throw new Error("预览图生成失败。");
    const completedAt = new Date();
    await db.transaction(async (transaction) => {
      await transaction.insert(mediaVariants).values(storedVariants);
      await transaction
        .update(mediaAssets)
        .set({
          storageKey: preview.storageKey,
          mimeType: preview.mimeType,
          byteSize: preview.byteSize,
          status: "ready",
          readyAt: completedAt,
          updatedAt: completedAt,
          failureCode: null,
        })
        .where(eq(mediaAssets.id, context.mediaId));
      await transaction
        .update(mediaProcessingJobs)
        .set({ status: "completed", completedAt })
        .where(eq(mediaProcessingJobs.id, context.jobId));
    });
    await localStorage.delete(context.incomingKey);
    await reconcilePublishingPosts([context.mediaId]);
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "图片处理失败。";
    await Promise.all(writtenKeys.map((key) => localStorage.delete(key)));
    await db.transaction(async (transaction) => {
      await transaction
        .update(mediaAssets)
        .set({
          status: "failed",
          failureCode: "processing_failed",
          updatedAt: completedAt,
        })
        .where(eq(mediaAssets.id, context.mediaId));
      await transaction
        .update(mediaProcessingJobs)
        .set({
          status: "failed",
          errorCode: "processing_failed",
          errorMessage: message.slice(0, 1000),
          completedAt,
        })
        .where(eq(mediaProcessingJobs.id, context.jobId));
      await transaction
        .update(mediaUploadSessions)
        .set({
          status: "failed",
          errorCode: "processing_failed",
          completedAt,
        })
        .where(eq(mediaUploadSessions.id, context.uploadSessionId));
    });
    await reconcilePublishingPosts([context.mediaId]);
  }
}

export async function getMediaVariant(mediaId: string, requested: MediaVariantType) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!asset) return null;

  const [variant] = await db
    .select()
    .from(mediaVariants)
    .where(
      and(
        eq(mediaVariants.mediaId, mediaId),
        eq(mediaVariants.variantType, requested),
      ),
    )
    .limit(1);

  if (variant) return { asset, variant, legacy: false as const };
  return {
    asset,
    variant: {
      mediaId,
      variantType: requested,
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.sourceWidth ?? 1,
      height: asset.sourceHeight ?? 1,
      etag: null,
      createdAt: asset.createdAt,
    },
    legacy: true as const,
  };
}

export async function readMediaObject(storageKey: string, legacy: boolean) {
  if (!legacy) return localStorage.read(storageKey);
  const { readStoredFile } = await import("@/lib/storage");
  return readStoredFile(storageKey);
}

export async function deleteMediaAsset(mediaId: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!asset) return;
  const variants = await db
    .select({ storageKey: mediaVariants.storageKey })
    .from(mediaVariants)
    .where(eq(mediaVariants.mediaId, mediaId));
  const sessions = await db
    .select({ incomingKey: mediaUploadSessions.incomingKey })
    .from(mediaUploadSessions)
    .where(eq(mediaUploadSessions.mediaId, mediaId));

  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
  const currentKeys = new Set([
    ...variants.map((variant) => variant.storageKey),
    ...sessions.map((session) => session.incomingKey),
  ]);
  await Promise.all([...currentKeys].map((key) => localStorage.delete(key)));
  if (variants.length === 0) {
    const { deleteStoredFile } = await import("@/lib/storage");
    await deleteStoredFile(asset.storageKey);
  }
}

export async function reconcilePublishingPosts(mediaIds: string[]) {
  if (mediaIds.length === 0) return;
  const links = await db
    .select({ postId: postMedia.postId })
    .from(postMedia)
    .where(inArray(postMedia.mediaId, mediaIds));
  const postIds = [...new Set(links.map((link) => link.postId))];
  for (const postId of postIds) {
    const linked = await db
      .select({ status: mediaAssets.status })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
      .where(eq(postMedia.postId, postId));
    if (linked.some((asset) => asset.status === "failed")) {
      await db
        .update(posts)
        .set({
          publicationStatus: "failed",
          publicationError: "部分照片处理失败，请重试。",
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));
    } else if (linked.length > 0 && linked.every((asset) => asset.status === "ready")) {
      const publishedAt = new Date();
      await db
        .update(posts)
        .set({
          publicationStatus: "published",
          publicationError: null,
          publishedAt,
          updatedAt: publishedAt,
        })
        .where(eq(posts.id, postId));
    }
  }
}

async function backfillLegacyMedia(mediaId: string) {
  const [asset] = await db
    .select({ asset: mediaAssets })
    .from(mediaAssets)
    .leftJoin(mediaVariants, eq(mediaVariants.mediaId, mediaAssets.id))
    .where(and(eq(mediaAssets.id, mediaId), isNull(mediaVariants.mediaId)))
    .limit(1);
  if (!asset) return false;

  const legacyAsset = asset.asset;
  const jobId = randomUUID();
  const writtenKeys: string[] = [];
  const startedAt = new Date();
  await db.insert(mediaProcessingJobs).values({
    id: jobId,
    mediaId,
    uploadSessionId: null,
    provider: localProcessor.provider,
    status: "processing",
    attempts: 1,
    startedAt,
  });

  try {
    const { deleteStoredFile, readStoredFile } = await import("@/lib/storage");
    const input = await readStoredFile(legacyAsset.storageKey);
    const source = await localProcessor.inspect(input);
    const processed = await localProcessor.process(input);
    const storedVariants: Array<typeof mediaVariants.$inferInsert> = [];

    for (const variant of processed) {
      const storageKey = path.posix.join(
        "media",
        mediaId,
        `${variant.variantType}-${randomUUID()}.${variant.extension}`,
      );
      const stored = await localStorage.put(storageKey, variant.bytes);
      writtenKeys.push(storageKey);
      storedVariants.push({
        mediaId,
        variantType: variant.variantType,
        storageKey,
        mimeType: variant.mimeType,
        byteSize: stored.byteSize,
        width: variant.width,
        height: variant.height,
        etag: stored.etag,
      });
    }

    const preview = storedVariants.find(
      (variant) => variant.variantType === "preview",
    );
    if (!preview) throw new Error("旧图片预览规格生成失败。");

    const completedAt = new Date();
    await db.transaction(async (transaction) => {
      await transaction.insert(mediaVariants).values(storedVariants);
      await transaction
        .update(mediaAssets)
        .set({
          storageKey: preview.storageKey,
          mimeType: preview.mimeType,
          byteSize: preview.byteSize,
          sourceMimeType: source.mimeType,
          sourceByteSize: legacyAsset.byteSize,
          sourceWidth: source.width,
          sourceHeight: source.height,
          readyAt: legacyAsset.readyAt ?? completedAt,
          updatedAt: completedAt,
        })
        .where(eq(mediaAssets.id, mediaId));
      await transaction
        .update(mediaProcessingJobs)
        .set({ status: "completed", completedAt })
        .where(eq(mediaProcessingJobs.id, jobId));
    });
    await deleteStoredFile(legacyAsset.storageKey);
    return true;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "旧图片迁移失败。";
    await Promise.all(writtenKeys.map((key) => localStorage.delete(key)));
    await db
      .update(mediaProcessingJobs)
      .set({
        status: "failed",
        errorCode: "legacy_backfill_failed",
        errorMessage: message.slice(0, 1000),
        completedAt,
      })
      .where(eq(mediaProcessingJobs.id, jobId));
    return false;
  }
}

export async function maintainLocalMedia(now = new Date()) {
  const queued = await db
    .select({ mediaId: mediaProcessingJobs.mediaId })
    .from(mediaProcessingJobs)
    .innerJoin(
      mediaUploadSessions,
      eq(mediaUploadSessions.id, mediaProcessingJobs.uploadSessionId),
    )
    .where(
      and(
        eq(mediaProcessingJobs.status, "queued"),
        gt(mediaUploadSessions.expiresAt, now),
      ),
    )
    .limit(20);
  for (const job of queued) await processLocalMedia(job.mediaId);

  const expired = await db
    .select({
      mediaId: mediaUploadSessions.mediaId,
      incomingKey: mediaUploadSessions.incomingKey,
    })
    .from(mediaUploadSessions)
    .where(
      and(
        inArray(mediaUploadSessions.status, [
          "issued",
          "uploading",
          "uploaded",
          "failed",
        ]),
        lt(mediaUploadSessions.expiresAt, now),
      ),
    )
    .limit(100);

  for (const session of expired) {
    const completedAt = new Date();
    await db.transaction(async (transaction) => {
      await transaction
        .update(mediaUploadSessions)
        .set({
          status: "expired",
          errorCode: "upload_expired",
          completedAt,
        })
        .where(eq(mediaUploadSessions.mediaId, session.mediaId));
      await transaction
        .update(mediaAssets)
        .set({
          status: "failed",
          failureCode: "upload_expired",
          updatedAt: completedAt,
        })
        .where(eq(mediaAssets.id, session.mediaId));
      await transaction
        .update(mediaProcessingJobs)
        .set({
          status: "failed",
          errorCode: "upload_expired",
          errorMessage: "临时上传超过 24 小时仍未完成或已失败。",
          completedAt,
        })
        .where(eq(mediaProcessingJobs.mediaId, session.mediaId));
    });
    await localStorage.delete(session.incomingKey);
    await reconcilePublishingPosts([session.mediaId]);

    const [postLink, draftLink] = await Promise.all([
      db
        .select({ id: postMedia.postId })
        .from(postMedia)
        .where(eq(postMedia.mediaId, session.mediaId))
        .limit(1),
      db
        .select({ id: draftMedia.draftId })
        .from(draftMedia)
        .where(eq(draftMedia.mediaId, session.mediaId))
        .limit(1),
    ]);
    if (!postLink.length && !draftLink.length) {
      await deleteMediaAsset(session.mediaId);
    }
  }

  const legacy = await db
    .select({ mediaId: mediaAssets.id })
    .from(mediaAssets)
    .leftJoin(mediaVariants, eq(mediaVariants.mediaId, mediaAssets.id))
    .where(and(eq(mediaAssets.status, "ready"), isNull(mediaVariants.mediaId)))
    .limit(20);
  let backfilled = 0;
  for (const asset of legacy) {
    if (await backfillLegacyMedia(asset.mediaId)) backfilled += 1;
  }

  return {
    resumed: queued.length,
    expired: expired.length,
    backfilled,
  };
}
