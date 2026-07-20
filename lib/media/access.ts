import "server-only";

import { and, eq, gt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  circleExitSnapshotMedia,
  circleExitSnapshotPosts,
  circleExitSnapshots,
  circleMemberRelations,
  draftMedia,
  drafts,
  mediaAssets,
  mediaUploadSessions,
  postMedia,
  userProfileAppearance,
} from "@/db/schema";
import { canViewPost } from "@/lib/content";
import { canViewProfileMedia } from "@/lib/profile-permissions";

export async function canAccessMedia(userId: string, mediaId: string) {
  const [asset] = await db
    .select({
      ownerId: mediaAssets.ownerId,
      status: mediaAssets.status,
      contentCommittedAt: mediaAssets.contentCommittedAt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!asset) return false;

  const [postLinks, draftLinks, archiveLinks, profileLinks] = await Promise.all([
    db
      .select({ postId: postMedia.postId })
      .from(postMedia)
      .where(eq(postMedia.mediaId, mediaId)),
    db
      .select({ authorId: drafts.authorId })
      .from(draftMedia)
      .innerJoin(drafts, eq(draftMedia.draftId, drafts.id))
      .where(eq(draftMedia.mediaId, mediaId)),
    db
      .select({
        userId: circleMemberRelations.userId,
        activePeriodId: circleMemberRelations.activePeriodId,
      })
      .from(circleExitSnapshotMedia)
      .innerJoin(
        circleExitSnapshotPosts,
        eq(
          circleExitSnapshotMedia.snapshotPostId,
          circleExitSnapshotPosts.id,
        ),
      )
      .innerJoin(
        circleExitSnapshots,
        eq(
          circleExitSnapshotPosts.exitSnapshotId,
          circleExitSnapshots.id,
        ),
      )
      .innerJoin(
        circleMemberRelations,
        eq(circleExitSnapshots.relationId, circleMemberRelations.id),
      )
      .where(eq(circleExitSnapshotMedia.mediaId, mediaId)),
    db
      .select({
        userId: userProfileAppearance.userId,
        avatarMediaId: userProfileAppearance.avatarMediaId,
        coverMediaId: userProfileAppearance.coverMediaId,
      })
      .from(userProfileAppearance)
      .where(
        or(
          eq(userProfileAppearance.avatarMediaId, mediaId),
          eq(userProfileAppearance.coverMediaId, mediaId),
        ),
      ),
  ]);

  for (const link of postLinks) {
    if (await canViewPost(userId, link.postId)) return true;
  }

  if (draftLinks.some((link) => link.authorId === userId)) return true;
  if (
    archiveLinks.some(
      (link) => link.userId === userId && link.activePeriodId === null,
    )
  ) {
    return true;
  }
  for (const link of profileLinks) {
    const role = link.avatarMediaId === mediaId ? "avatar" : "cover";
    if (await canViewProfileMedia(userId, link.userId, role)) return true;
  }

  if (
    asset.ownerId !== userId ||
    asset.contentCommittedAt !== null ||
    asset.status === "deleting" ||
    postLinks.length > 0 ||
    draftLinks.length > 0 ||
    archiveLinks.length > 0 ||
    profileLinks.length > 0
  ) {
    return false;
  }
  const [activeUpload] = await db
    .select({ id: mediaUploadSessions.id })
    .from(mediaUploadSessions)
    .where(
      and(
        eq(mediaUploadSessions.mediaId, mediaId),
        eq(mediaUploadSessions.ownerId, userId),
        gt(mediaUploadSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(activeUpload);
}
