import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mediaAssets, postMedia } from "@/db/schema";
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
  return false;
}

