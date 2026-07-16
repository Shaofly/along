import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  postMedia,
  posts,
  postViewers,
  mediaAssets,
  user,
} from "@/db/schema";
import type { FeedPost } from "@/lib/content-types";
import { getFriends } from "@/lib/invitations";

export async function getVisiblePosts(
  viewerId: string,
  options: { authorId?: string; limit?: number } = {},
): Promise<FeedPost[]> {
  const friends = await getFriends(viewerId);
  const friendIds = friends.map((friend) => friend.id);
  const selectedPosts = db
    .select({ postId: postViewers.postId })
    .from(postViewers)
    .where(eq(postViewers.userId, viewerId));

  const visibilityCondition = or(
    eq(posts.authorId, viewerId),
    friendIds.length > 0
      ? and(
          eq(posts.visibility, "friends"),
          inArray(posts.authorId, friendIds),
        )
      : undefined,
    and(eq(posts.visibility, "selected"), inArray(posts.id, selectedPosts)),
  );

  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      visibility: posts.visibility,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(posts)
    .innerJoin(user, eq(posts.authorId, user.id))
    .where(
      options.authorId
        ? and(visibilityCondition, eq(posts.authorId, options.authorId))
        : visibilityCondition,
    )
    .orderBy(desc(posts.createdAt))
    .limit(Math.min(options.limit ?? 30, 50));

  if (rows.length === 0) {
    return [];
  }

  const mediaRows = await db
    .select({
      postId: postMedia.postId,
      mediaId: mediaAssets.id,
      originalName: mediaAssets.originalName,
      mimeType: mediaAssets.mimeType,
      position: postMedia.position,
    })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
    .where(inArray(postMedia.postId, rows.map((row) => row.id)))
    .orderBy(postMedia.position);

  const viewerRows = await db
    .select({ postId: postViewers.postId, userId: postViewers.userId })
    .from(postViewers)
    .where(inArray(postViewers.postId, rows.map((row) => row.id)));

  const mediaByPost = new Map<string, FeedPost["media"]>();
  for (const media of mediaRows) {
    const list = mediaByPost.get(media.postId) ?? [];
    list.push({
      id: media.mediaId,
      originalName: media.originalName,
      mimeType: media.mimeType,
    });
    mediaByPost.set(media.postId, list);
  }

  const viewersByPost = new Map<string, string[]>();
  for (const viewer of viewerRows) {
    const list = viewersByPost.get(viewer.postId) ?? [];
    list.push(viewer.userId);
    viewersByPost.set(viewer.postId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.authorId,
      name: row.authorName,
      image: row.authorImage,
    },
    media: mediaByPost.get(row.id) ?? [],
    viewerIds: row.authorId === viewerId ? viewersByPost.get(row.id) ?? [] : [],
  }));
}

export async function canViewPost(viewerId: string, postId: string) {
  const [post] = await db
    .select({ authorId: posts.authorId, visibility: posts.visibility })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) return false;
  if (post.authorId === viewerId) return true;
  if (post.visibility === "private") return false;

  if (post.visibility === "selected") {
    const [viewer] = await db
      .select({ userId: postViewers.userId })
      .from(postViewers)
      .where(
        and(eq(postViewers.postId, postId), eq(postViewers.userId, viewerId)),
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
      image: user.image,
      bio: user.bio,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, profileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const friends = await getFriends(viewerId);
  const isSelf = viewerId === profileId;
  if (!isSelf && !friends.some((friend) => friend.id === profileId)) {
    return null;
  }

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    isSelf,
    posts: await getVisiblePosts(viewerId, { authorId: profileId, limit: 40 }),
  };
}
