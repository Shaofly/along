import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { mediaAssets, postMedia, posts, postViewers } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFriends } from "@/lib/invitations";
import { deleteStoredFile } from "@/lib/storage";

const editPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  viewerIds: z.array(z.string()).max(100).default([]),
});

async function ownedPost(id: string, userId: string) {
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.authorId, userId)))
    .limit(1);
  return post ?? null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!(await ownedPost(id, session.user.id))) {
    return NextResponse.json({ error: "动态不存在。" }, { status: 404 });
  }

  const parsed = editPostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查动态内容。" },
      { status: 400 },
    );
  }
  const [image] = await db
    .select({ id: postMedia.mediaId })
    .from(postMedia)
    .where(eq(postMedia.postId, id))
    .limit(1);
  if (!parsed.data.body && !image) {
    return NextResponse.json({ error: "动态内容不能为空。" }, { status: 400 });
  }

  const viewerIds = [...new Set(parsed.data.viewerIds)].filter(
    (viewerId) => viewerId !== session.user.id,
  );
  if (parsed.data.visibility === "selected") {
    if (viewerIds.length === 0) {
      return NextResponse.json({ error: "请至少选择一位朋友。" }, { status: 400 });
    }
    const friends = await getFriends(session.user.id);
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!viewerIds.every((viewerId) => friendIds.has(viewerId))) {
      return NextResponse.json({ error: "指定可见者必须是你的朋友。" }, { status: 403 });
    }
  }

  await db.transaction(async (transaction) => {
    await transaction
      .update(posts)
      .set({
        body: parsed.data.body,
        visibility: parsed.data.visibility,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));
    await transaction.delete(postViewers).where(eq(postViewers.postId, id));
    if (parsed.data.visibility === "selected") {
      await transaction.insert(postViewers).values(
        viewerIds.map((userId) => ({ postId: id, userId })),
      );
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!(await ownedPost(id, session.user.id))) {
    return NextResponse.json({ error: "动态不存在。" }, { status: 404 });
  }

  const assets = await db
    .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
    .where(eq(postMedia.postId, id));

  await db.transaction(async (transaction) => {
    await transaction.delete(posts).where(eq(posts.id, id));
    if (assets.length > 0) {
      await transaction
        .delete(mediaAssets)
        .where(inArray(mediaAssets.id, assets.map((asset) => asset.id)));
    }
  });
  await Promise.all(assets.map((asset) => deleteStoredFile(asset.storageKey)));
  return NextResponse.json({ ok: true });
}
