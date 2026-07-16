import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { mediaAssets, postMedia, posts, postViewers } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFriends } from "@/lib/invitations";

const createPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  viewerIds: z.array(z.string()).max(100).default([]),
  mediaIds: z.array(z.string()).max(20, "每条动态最多 20 张图片").default([]),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const parsed = createPostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查动态内容。" },
      { status: 400 },
    );
  }

  const mediaIds = [...new Set(parsed.data.mediaIds)];
  const viewerIds = [...new Set(parsed.data.viewerIds)].filter(
    (id) => id !== session.user.id,
  );
  if (!parsed.data.body && mediaIds.length === 0) {
    return NextResponse.json({ error: "写点什么，或者选择一张图片。" }, { status: 400 });
  }
  if (parsed.data.visibility === "selected" && viewerIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一位朋友。" }, { status: 400 });
  }

  const friends = await getFriends(session.user.id);
  const friendIds = new Set(friends.map((friend) => friend.id));
  if (!viewerIds.every((id) => friendIds.has(id))) {
    return NextResponse.json({ error: "指定可见者必须是你的朋友。" }, { status: 403 });
  }

  if (mediaIds.length > 0) {
    const ownedMedia = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.ownerId, session.user.id),
          inArray(mediaAssets.id, mediaIds),
        ),
      );
    const existingLinks = await db
      .select({ id: postMedia.mediaId })
      .from(postMedia)
      .where(inArray(postMedia.mediaId, mediaIds));
    if (ownedMedia.length !== mediaIds.length || existingLinks.length > 0) {
      return NextResponse.json({ error: "有图片无效或已经发布。" }, { status: 400 });
    }
  }

  const id = randomUUID();
  await db.transaction(async (transaction) => {
    await transaction.insert(posts).values({
      id,
      authorId: session.user.id,
      body: parsed.data.body,
      visibility: parsed.data.visibility,
    });
    if (parsed.data.visibility === "selected") {
      await transaction.insert(postViewers).values(
        viewerIds.map((userId) => ({ postId: id, userId })),
      );
    }
    if (mediaIds.length > 0) {
      await transaction.insert(postMedia).values(
        mediaIds.map((mediaId, position) => ({ postId: id, mediaId, position })),
      );
    }
  });

  return NextResponse.json({ ok: true, id });
}
