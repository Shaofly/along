import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import {
  circleExitSnapshotMedia,
  circleExitSnapshotPosts,
  circleExitSnapshots,
  circleMemberRelations,
  circles,
  mediaAssets,
  postMedia,
  postParticipants,
  posts,
  postViewers,
  user,
} from "@/db/schema";
import type { FeedPost } from "@/lib/content-types";
import { getFriends } from "@/lib/invitations";

type VisiblePostOptions = {
  authorId?: string;
  profileId?: string;
  circleId?: string;
  postId?: string;
  limit?: number;
};

function toMediaMap(
  rows: Array<{
    postId: string;
    mediaId: string;
    originalName: string;
    mimeType: string;
  }>,
) {
  const mediaByPost = new Map<string, FeedPost["media"]>();
  for (const media of rows) {
    const list = mediaByPost.get(media.postId) ?? [];
    list.push({
      id: media.mediaId,
      originalName: media.originalName,
      mimeType: media.mimeType,
    });
    mediaByPost.set(media.postId, list);
  }
  return mediaByPost;
}

export async function getVisiblePosts(
  viewerId: string,
  options: VisiblePostOptions = {},
): Promise<FeedPost[]> {
  const [friends, activeRelations] = await Promise.all([
    getFriends(viewerId),
    db
      .select({
        circleId: circleMemberRelations.circleId,
        historyVisibleFrom: circleMemberRelations.historyVisibleFrom,
      })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.userId, viewerId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      ),
  ]);
  const friendIds = friends.map((friend) => friend.id);
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
  const circleConditions = activeRelations.map((relation) =>
    and(
      eq(posts.circleId, relation.circleId),
      gte(posts.createdAt, relation.historyVisibleFrom),
    ),
  );
  const visibilityCondition = or(personalCondition, ...circleConditions);
  if (!visibilityCondition) return [];

  let profileCondition;
  if (options.profileId) {
    const participatedPosts = db
      .select({ postId: postParticipants.postId })
      .from(postParticipants)
      .where(eq(postParticipants.userId, options.profileId));
    const profileActiveCircles = db
      .select({ circleId: circleMemberRelations.circleId })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.userId, options.profileId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    profileCondition = or(
      and(
        isNull(posts.circleId),
        eq(posts.authorId, options.profileId),
      ),
      and(
        isNotNull(posts.circleId),
        inArray(posts.id, participatedPosts),
        inArray(posts.circleId, profileActiveCircles),
      ),
    );
  }

  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      visibility: posts.visibility,
      managementMode: posts.managementMode,
      lastEditedById: posts.lastEditedById,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      publicationStatus: posts.publicationStatus,
      publicationError: posts.publicationError,
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
        or(
          eq(posts.publicationStatus, "published"),
          eq(posts.authorId, viewerId),
        ),
        profileCondition,
        options.authorId ? eq(posts.authorId, options.authorId) : undefined,
        options.circleId ? eq(posts.circleId, options.circleId) : undefined,
        options.postId ? eq(posts.id, options.postId) : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(Math.min(options.limit ?? 30, 50));

  if (rows.length === 0) return [];
  const postIds = rows.map((row) => row.id);
  const [mediaRows, viewerRows, participantRows] = await Promise.all([
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
      .select({
        postId: postParticipants.postId,
        userId: postParticipants.userId,
        name: user.name,
        realName: user.realName,
      })
      .from(postParticipants)
      .innerJoin(user, eq(postParticipants.userId, user.id))
      .where(inArray(postParticipants.postId, postIds)),
  ]);
  const rowCircleIds = [
    ...new Set(
      rows
        .map((row) => row.circleId)
        .filter((circleId): circleId is string => Boolean(circleId)),
    ),
  ];
  const activeCircleMemberRows = rowCircleIds.length
    ? await db
        .select({
          circleId: circleMemberRelations.circleId,
          id: user.id,
          name: user.name,
          realName: user.realName,
        })
        .from(circleMemberRelations)
        .innerJoin(user, eq(circleMemberRelations.userId, user.id))
        .where(
          and(
            inArray(circleMemberRelations.circleId, rowCircleIds),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        )
    : [];
  const editorIds = [
    ...new Set(
      rows
        .map((row) => row.lastEditedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const editorRows = editorIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, editorIds))
    : [];
  const editorNames = new Map(editorRows.map((editor) => [editor.id, editor.name]));
  const activeCircleIds = new Set(activeRelations.map((relation) => relation.circleId));
  const mediaByPost = toMediaMap(mediaRows);
  const viewersByPost = new Map<string, string[]>();
  for (const viewer of viewerRows) {
    const list = viewersByPost.get(viewer.postId) ?? [];
    list.push(viewer.userId);
    viewersByPost.set(viewer.postId, list);
  }
  const membersByCircle = new Map<string, FeedPost["circleMembers"]>();
  for (const member of activeCircleMemberRows) {
    const list = membersByCircle.get(member.circleId) ?? [];
    list.push({
      id: member.id,
      name: member.name,
      realName: member.realName,
      isActive: true,
    });
    membersByCircle.set(member.circleId, list);
  }
  const postCircleIds = new Map(rows.map((row) => [row.id, row.circleId]));
  const participantsByPost = new Map<string, FeedPost["participants"]>();
  for (const participant of participantRows) {
    const circleId = postCircleIds.get(participant.postId);
    const activeMemberIds = new Set(
      circleId
        ? (membersByCircle.get(circleId) ?? []).map((member) => member.id)
        : [],
    );
    const list = participantsByPost.get(participant.postId) ?? [];
    list.push({
      id: participant.userId,
      name: participant.name,
      realName: participant.realName,
      isActive: activeMemberIds.has(participant.userId),
    });
    participantsByPost.set(participant.postId, list);
  }

  return rows.map((row) => {
    const isCirclePost = Boolean(row.circleId);
    const canManageCirclePost = Boolean(
      row.circleId &&
      activeCircleIds.has(row.circleId) &&
      row.circleStatus === "active" &&
      (row.managementMode === "circle" || row.authorId === viewerId),
    );
    const canManagePersonalPost = !isCirclePost && row.authorId === viewerId;
    return {
      id: row.id,
      body: row.body,
      visibility: row.visibility,
      managementMode: row.managementMode,
      publicationStatus: row.publicationStatus,
      publicationError: row.publicationError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        name: row.authorName,
        image: row.authorImage,
      },
      circle:
        row.circleId && row.circleName
          ? { id: row.circleId, name: row.circleName }
          : null,
      lastEditor: row.lastEditedById
        ? {
            id: row.lastEditedById,
            name: editorNames.get(row.lastEditedById) ?? "一位成员",
          }
        : null,
      canEdit: canManagePersonalPost || canManageCirclePost,
      canDelete: canManagePersonalPost || canManageCirclePost,
      isHistorical: false,
      media: mediaByPost.get(row.id) ?? [],
      viewerIds:
        !isCirclePost && row.authorId === viewerId
          ? viewersByPost.get(row.id) ?? []
          : [],
      participantIds: isCirclePost
        ? (participantsByPost.get(row.id) ?? []).map(
            (participant) => participant.id,
          )
        : [],
      participants: isCirclePost
        ? participantsByPost.get(row.id) ?? []
        : [],
      circleMembers: row.circleId
        ? membersByCircle.get(row.circleId) ?? []
        : [],
    };
  });
}

export async function getCircleArchivePosts(
  viewerId: string,
  circleId: string,
  limit = 40,
): Promise<FeedPost[]> {
  const [archive] = await db
    .select({
      id: circleExitSnapshots.id,
      name: circleExitSnapshots.circleName,
    })
    .from(circleExitSnapshots)
    .innerJoin(
      circleMemberRelations,
      eq(circleExitSnapshots.relationId, circleMemberRelations.id),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, viewerId),
        eq(circleMemberRelations.circleId, circleId),
        isNull(circleMemberRelations.activePeriodId),
      ),
    )
    .limit(1);
  if (!archive) return [];

  const rows = await db
    .select({
      id: circleExitSnapshotPosts.id,
      body: circleExitSnapshotPosts.body,
      createdAt: circleExitSnapshotPosts.createdAt,
      updatedAt: circleExitSnapshotPosts.updatedAt,
      lastEditedById: circleExitSnapshotPosts.lastEditedById,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(circleExitSnapshotPosts)
    .innerJoin(user, eq(circleExitSnapshotPosts.authorId, user.id))
    .where(eq(circleExitSnapshotPosts.exitSnapshotId, archive.id))
    .orderBy(desc(circleExitSnapshotPosts.createdAt))
    .limit(Math.min(limit, 50));
  if (!rows.length) return [];

  const postIds = rows.map((row) => row.id);
  const mediaRows = await db
    .select({
      postId: circleExitSnapshotMedia.snapshotPostId,
      mediaId: mediaAssets.id,
      originalName: mediaAssets.originalName,
      mimeType: mediaAssets.mimeType,
      position: circleExitSnapshotMedia.position,
    })
    .from(circleExitSnapshotMedia)
    .innerJoin(
      mediaAssets,
      eq(circleExitSnapshotMedia.mediaId, mediaAssets.id),
    )
    .where(inArray(circleExitSnapshotMedia.snapshotPostId, postIds))
    .orderBy(circleExitSnapshotMedia.position);
  const editorIds = [
    ...new Set(
      rows
        .map((row) => row.lastEditedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const editorRows = editorIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, editorIds))
    : [];
  const editorNames = new Map(editorRows.map((editor) => [editor.id, editor.name]));
  const mediaByPost = toMediaMap(mediaRows);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    visibility: "private",
    managementMode: "creator",
    publicationStatus: "published",
    publicationError: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.authorId,
      name: row.authorName,
      image: row.authorImage,
    },
    circle: { id: circleId, name: archive.name },
    lastEditor: row.lastEditedById
      ? {
          id: row.lastEditedById,
          name: editorNames.get(row.lastEditedById) ?? "一位成员",
        }
      : null,
    canEdit: false,
    canDelete: false,
    isHistorical: true,
    media: mediaByPost.get(row.id) ?? [],
    viewerIds: [],
    participantIds: [],
    participants: [],
    circleMembers: [],
  }));
}

export async function getEditablePost(viewerId: string, postId: string) {
  const [post] = await getVisiblePosts(viewerId, { postId, limit: 1 });
  return post?.canEdit ? post : null;
}

export async function canViewPost(viewerId: string, postId: string) {
  const [post] = await db
    .select({
      authorId: posts.authorId,
      circleId: posts.circleId,
      visibility: posts.visibility,
      publicationStatus: posts.publicationStatus,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return false;

  if (post.authorId !== viewerId && post.publicationStatus !== "published") {
    return false;
  }
  if (post.circleId) {
    const [relation] = await db
      .select({ historyVisibleFrom: circleMemberRelations.historyVisibleFrom })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.userId, viewerId),
          eq(circleMemberRelations.circleId, post.circleId),
          isNotNull(circleMemberRelations.activePeriodId),
          lte(circleMemberRelations.historyVisibleFrom, post.createdAt),
        ),
      )
      .limit(1);
    return Boolean(relation);
  }
  if (post.authorId === viewerId) return true;
  if (post.visibility === "private") return false;
  if (post.visibility === "selected") {
    const [viewer] = await db
      .select({ userId: postViewers.userId })
      .from(postViewers)
      .where(
        and(
          eq(postViewers.postId, postId),
          eq(postViewers.userId, viewerId),
        ),
      )
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
    const [viewerRelations, profileRelations] = await Promise.all([
      db
        .select({ circleId: circleMemberRelations.circleId })
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.userId, viewerId),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        ),
      db
        .select({ circleId: circleMemberRelations.circleId })
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.userId, profileId),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        ),
    ]);
    const profileCircleIds = new Set(
      profileRelations.map((relation) => relation.circleId),
    );
    hasCircleRelationship = viewerRelations.some((relation) =>
      profileCircleIds.has(relation.circleId),
    );
    if (!hasCircleRelationship) return null;
  }

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    isSelf,
    isLimitedByCircle: !isSelf && hasCircleRelationship,
    posts: await getVisiblePosts(viewerId, { profileId, limit: 40 }),
  };
}
