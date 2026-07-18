import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  circleExitSnapshotMedia,
  circleExitSnapshotPosts,
  circleExitSnapshots,
  circleMemberRelations,
  mediaAssets,
  postMedia,
} from "@/db/schema";
import { canViewPost } from "@/lib/content";

export async function canAccessMedia(userId: string, mediaId: string) {
  const [asset] = await db
    .select({ ownerId: mediaAssets.ownerId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!asset) return false;
  if (asset.ownerId === userId) return true;

  const links = await db
    .select({ postId: postMedia.postId })
    .from(postMedia)
    .where(eq(postMedia.mediaId, mediaId));
  for (const link of links) {
    if (await canViewPost(userId, link.postId)) return true;
  }

  const [archiveLink] = await db
    .select({ snapshotId: circleExitSnapshots.id })
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
    .where(
      and(
        eq(circleExitSnapshotMedia.mediaId, mediaId),
        eq(circleMemberRelations.userId, userId),
        isNull(circleMemberRelations.activePeriodId),
      ),
    )
    .limit(1);
  if (archiveLink) return true;

  return false;
}
