import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { draftMedia, drafts, draftViewers, mediaAssets, postMedia } from "@/db/schema";
import type { HomeDraft } from "@/lib/content-types";
import { deleteStoredFile } from "@/lib/storage";

export async function getLatestDraft(authorId: string): Promise<HomeDraft | null> {
  const [draft] = await db
    .select({
      id: drafts.id,
      body: drafts.body,
      visibility: drafts.visibility,
      circleId: drafts.circleId,
      managementMode: drafts.managementMode,
      updatedAt: drafts.updatedAt,
    })
    .from(drafts)
    .where(eq(drafts.authorId, authorId))
    .orderBy(desc(drafts.updatedAt))
    .limit(1);

  if (!draft) return null;

  const [viewerRows, mediaRows] = await Promise.all([
    db
      .select({ userId: draftViewers.userId })
      .from(draftViewers)
      .where(eq(draftViewers.draftId, draft.id)),
    db
      .select({
        id: mediaAssets.id,
        originalName: mediaAssets.originalName,
        mimeType: mediaAssets.mimeType,
        position: draftMedia.position,
      })
      .from(draftMedia)
      .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
      .where(eq(draftMedia.draftId, draft.id))
      .orderBy(draftMedia.position),
  ]);

  return {
    ...draft,
    viewerIds: viewerRows.map((row) => row.userId),
    media: mediaRows.map((media) => ({
      id: media.id,
      originalName: media.originalName,
      mimeType: media.mimeType,
    })),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function deleteDraftWithAssets(authorId: string, draftId: string) {
  const [draft] = await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.authorId, authorId)))
    .limit(1);
  if (!draft) return false;

  const linkedMedia = await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
    .from(draftMedia)
    .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
    .where(eq(draftMedia.draftId, draftId));
  const mediaIds = linkedMedia.map((media) => media.id);
  const published = mediaIds.length
    ? await db
        .select({ id: postMedia.mediaId })
        .from(postMedia)
        .where(inArray(postMedia.mediaId, mediaIds))
    : [];
  const publishedIds = new Set(published.map((media) => media.id));
  const removable = linkedMedia.filter((media) => !publishedIds.has(media.id));

  await db.transaction(async (transaction) => {
    await transaction.delete(drafts).where(eq(drafts.id, draftId));
    if (removable.length) {
      await transaction
        .delete(mediaAssets)
        .where(inArray(mediaAssets.id, removable.map((media) => media.id)));
    }
  });
  await Promise.all(removable.map((media) => deleteStoredFile(media.storageKey)));
  return true;
}
