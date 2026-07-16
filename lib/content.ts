import "server-only";

import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import {
  circleMembershipPeriods,
  circlePostSnapshots,
  circles,
  mediaAssets,
  postMedia,
  posts,
  postViewers,
  user,
} from "@/db/schema";
import { getCirclePeriods, periodCanSeeCreatedAt } from "@/lib/circles";
import type { FeedPost } from "@/lib/content-types";
import { getFriends } from "@/lib/invitations";

export async function getVisiblePosts(
  viewerId: string,
  options: { authorId?: string; circleId?: string; limit?: number } = {},
): Promise<FeedPost[]> {
  const [friends, periods] = await Promise.all([
    getFriends(viewerId),
    getCirclePeriods(viewerId),
  ]);
  const friendIds = friends.map((friend) => friend.id);
  const activeCircleIds = new Set(
    periods.filter((period) => period.leftAt === null).map((period) => period.circleId),
  );
  const selectedPosts = db
    .select({ postId: postViewers.postId })
    .from(postViewers)
    .where(eq(postViewers.userId, viewerId));

  const personalCondition = and(
    isNull(posts.circleId),
    or(
      eq(posts.authorId, viewerId),
      friendIds.length > 0
        ? and(
            eq(posts.visibility, "friends"),
            inArray(posts.authorId, friendIds),
          )
        : undefined,
      and(eq(posts.visibility, "selected"), inArray(posts.id, selectedPosts)),
    ),
  );
  const circleConditions = periods.map((period) =>
    and(
      eq(posts.circleId, period.circleId),
      period.visibleFrom ? gte(posts.createdAt, period.visibleFrom) : undefined,
      period.leftAt ? lte(posts.createdAt, period.leftAt) : undefined,
    ),
  );
  const visibilityCondition = or(personalCondition, ...circleConditions);
  if (!visibilityCondition) return [];

  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      visibility: posts.visibility,
      managementMode: posts.managementMode,
      lastEditedById: posts.lastEditedById,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
      circleId: circles.id,
      circleName: circles.name,
      circleStatus: circles.status,
    })
    .from(posts)
    .innerJoin(user, eq(posts.authorId, user.id))
    .leftJoin(circles, eq(posts.circleId, circles.id))
    .where(
      and(
        visibilityCondition,
        options.authorId ? eq(posts.authorId, options.authorId) : undefined,
        options.circleId ? eq(posts.circleId, options.circleId) : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(Math.min(options.limit ?? 30, 50));

  if (rows.length === 0) return [];
  const postIds = rows.map((row) => row.id);
  const [mediaRows, viewerRows, snapshotRows] = await Promise.all([
    db
      .select({
        postId: postMedia.postId,
        mediaId: mediaAssets.id,
        originalName: mediaAssets.originalName,
        mimeType: mediaAssets.mimeType,
        position: postMedia.position,
      })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
      .where(inArray(postMedia.postId, postIds))
      .orderBy(postMedia.position),
    db
      .select({ postId: postViewers.postId, userId: postViewers.userId })
      .from(postViewers)
      .where(inArray(postViewers.postId, postIds)),
    db
      .select()
      .from(circlePostSnapshots)
      .where(
        and(
          eq(circlePostSnapshots.userId, viewerId),
          inArray(circlePostSnapshots.postId, postIds),
        ),
      ),
  ]);

  const editorIds = [...new Set([
    ...rows.map((row) => row.lastEditedById).filter((id): id is string => Boolean(id)),
    ...snapshotRows.map((row) => row.lastEditedById).filter((id): id is string => Boolean(id)),
  ])];
  const editorRows = editorIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, editorIds))
    : [];
  const editorNames = new Map(editorRows.map((editor) => [editor.id, editor.name]));

  const mediaByPost = new Map<string, FeedPost["media"]>();
  for (const media of mediaRows) {
    const list = mediaByPost.get(media.postId) ?? [];
    list.push({ id: media.mediaId, originalName: media.originalName, mimeType: media.mimeType });
    mediaByPost.set(media.postId, list);
  }
  const viewersByPost = new Map<string, string[]>();
  for (const viewer of viewerRows) {
    const list = viewersByPost.get(viewer.postId) ?? [];
    list.push(viewer.userId);
    viewersByPost.set(viewer.postId, list);
  }
  const snapshotsByPost = new Map(snapshotRows.map((snapshot) => [snapshot.postId, snapshot]));

  return rows.map((row) => {
    const isCirclePost = Boolean(row.circleId);
    const isHistorical = Boolean(row.circleId && !activeCircleIds.has(row.circleId));
    const snapshot = isHistorical ? snapshotsByPost.get(row.id) : null;
    const body = snapshot?.body ?? row.body;
    const updatedAt = snapshot?.updatedAt ?? row.updatedAt;
    const lastEditedById = snapshot?.lastEditedById ?? row.lastEditedById;
    const canManageCirclePost = Boolean(
      row.circleId &&
      activeCircleIds.has(row.circleId) &&
      row.circleStatus === "active" &&
      (row.managementMode === "circle" || row.authorId === viewerId),
    );
    const canManagePersonalPost = !isCirclePost && row.authorId === viewerId;
    return {
      id: row.id,
      body,
      visibility: row.visibility,
      managementMode: row.managementMode,
      createdAt: row.createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      author: { id: row.authorId, name: row.authorName, image: row.authorImage },
      circle: row.circleId && row.circleName ? { id: row.circleId, name: row.circleName } : null,
      lastEditor: lastEditedById
        ? { id: lastEditedById, name: editorNames.get(lastEditedById) ?? "一位成员" }
        : null,
      canEdit: canManagePersonalPost || canManageCirclePost,
      canDelete: canManagePersonalPost || canManageCirclePost,
      isHistorical,
      media: mediaByPost.get(row.id) ?? [],
      viewerIds: !isCirclePost && row.authorId === viewerId
        ? viewersByPost.get(row.id) ?? []
        : [],
    };
  });
}

export async function canViewPost(viewerId: string, postId: string) {
  const [post] = await db
    .select({
      authorId: posts.authorId,
      circleId: posts.circleId,
      visibility: posts.visibility,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return false;

  if (post.circleId) {
    const periods = await getCirclePeriods(viewerId, post.circleId);
    return periods.some((period) => periodCanSeeCreatedAt(period, post.createdAt));
  }
  if (post.authorId === viewerId) return true;
  if (post.visibility === "private") return false;
  if (post.visibility === "selected") {
    const [viewer] = await db
      .select({ userId: postViewers.userId })
      .from(postViewers)
      .where(and(eq(postViewers.postId, postId), eq(postViewers.userId, viewerId)))
      .limit(1);
    return Boolean(viewer);
  }
  const friends = await getFriends(viewerId);
  return friends.some((friend) => friend.id === post.authorId);
}

export async function getProfileForViewer(viewerId: string, profileId: string) {
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      realName: user.realName,
      nickname: user.nickname,
      image: user.image,
      bio: user.bio,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, profileId))
    .limit(1);
  if (!profile) return null;

  const friends = await getFriends(viewerId);
  const isSelf = viewerId === profileId;
  let hasCircleRelationship = false;
  if (!isSelf && !friends.some((friend) => friend.id === profileId)) {
    const [viewerPeriods, profilePeriods] = await Promise.all([
      db
        .select({ circleId: circleMembershipPeriods.circleId })
        .from(circleMembershipPeriods)
        .where(eq(circleMembershipPeriods.userId, viewerId)),
      db
        .select({ circleId: circleMembershipPeriods.circleId })
        .from(circleMembershipPeriods)
        .where(eq(circleMembershipPeriods.userId, profileId)),
    ]);
    const profileCircleIds = new Set(profilePeriods.map((period) => period.circleId));
    hasCircleRelationship = viewerPeriods.some((period) => profileCircleIds.has(period.circleId));
    if (!hasCircleRelationship) return null;
  }

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    isSelf,
    isLimitedByCircle: !isSelf && hasCircleRelationship,
    posts: await getVisiblePosts(viewerId, { authorId: profileId, limit: 40 }),
  };
}
