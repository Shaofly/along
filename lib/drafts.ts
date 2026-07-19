import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  circleMemberRelations,
  circles,
  draftMedia,
  drafts,
  draftViewers,
  mediaAssets,
  postMedia,
} from "@/db/schema";
import type { HomeDraft } from "@/lib/content-types";
import { deleteMediaAsset } from "@/lib/media/service";

export async function getLatestDraft(authorId: string): Promise<HomeDraft | null> {
  const activeCircleIds = db
    .select({ circleId: circleMemberRelations.circleId })
    .from(circleMemberRelations)
    .innerJoin(
      circles,
      and(
        eq(circleMemberRelations.circleId, circles.id),
        eq(circles.status, "active"),
      ),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, authorId),
        isNotNull(circleMemberRelations.activePeriodId),
      ),
    );
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
    .where(
      and(
        eq(drafts.authorId, authorId),
        or(
          isNull(drafts.circleId),
          inArray(drafts.circleId, activeCircleIds),
        ),
      ),
    )
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
    .select({ id: mediaAssets.id })
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

  await db.delete(drafts).where(eq(drafts.id, draftId));
  await Promise.all(removable.map((media) => deleteMediaAsset(media.id)));
  return true;
}
