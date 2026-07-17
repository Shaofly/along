import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { circles, mediaAssets, postMedia, posts, postViewers } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActiveCircleMembership } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";
import { deleteMediaAsset } from "@/lib/media/service";

const editPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]).optional(),
  viewerIds: z.array(z.string()).max(100).default([]),
  managementMode: z.enum(["creator", "circle"]).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

async function manageablePost(id: string, userId: string) {
  const [post] = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      circleId: posts.circleId,
      visibility: posts.visibility,
      managementMode: posts.managementMode,
      updatedAt: posts.updatedAt,
      circleStatus: circles.status,
    })
    .from(posts)
    .leftJoin(circles, eq(posts.circleId, circles.id))
    .where(eq(posts.id, id))
    .limit(1);
  if (!post) return null;
  if (!post.circleId) return post.authorId === userId ? post : null;

  const membership = await getActiveCircleMembership(userId, post.circleId);
  const canManage = Boolean(
    membership &&
    post.circleStatus === "active" &&
    (post.managementMode === "circle" || post.authorId === userId),
  );
  return canManage ? post : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const post = await manageablePost(id, session.user.id);
  if (!post) return NextResponse.json({ error: "动态不存在或当前不可修改。" }, { status: 404 });

  const parsed = editPostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查动态内容。" },
      { status: 400 },
    );
  }
  if (
    parsed.data.expectedUpdatedAt &&
    new Date(parsed.data.expectedUpdatedAt).getTime() !== post.updatedAt.getTime()
  ) {
    return NextResponse.json(
      { error: "这条记录刚刚被其他成员修改了，请刷新后再编辑。" },
      { status: 409 },
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

  const nextVisibility = post.circleId
    ? "private"
    : parsed.data.visibility ?? post.visibility;
  const viewerIds = [...new Set(parsed.data.viewerIds)].filter(
    (viewerId) => viewerId !== session.user.id,
  );
  if (!post.circleId && nextVisibility === "selected") {
    if (viewerIds.length === 0) {
      return NextResponse.json({ error: "请至少选择一位朋友。" }, { status: 400 });
    }
    const friends = await getFriends(session.user.id);
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!viewerIds.every((viewerId) => friendIds.has(viewerId))) {
      return NextResponse.json({ error: "指定可见者必须是你的朋友。" }, { status: 403 });
    }
  }

  let nextManagementMode = post.managementMode;
  if (post.circleId && parsed.data.managementMode) {
    if (post.managementMode === "circle" && parsed.data.managementMode === "creator") {
      return NextResponse.json({ error: "共同管理不能再改回仅创建者管理。" }, { status: 400 });
    }
    if (
      post.managementMode === "creator" &&
      parsed.data.managementMode === "circle" &&
      post.authorId !== session.user.id
    ) {
      return NextResponse.json({ error: "只有创建者可以升级管理方式。" }, { status: 403 });
    }
    nextManagementMode = parsed.data.managementMode;
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(posts)
      .set({
        body: parsed.data.body,
        visibility: nextVisibility,
        managementMode: nextManagementMode,
        lastEditedById: session.user.id,
        updatedAt: now,
      })
      .where(eq(posts.id, id));
    await transaction.delete(postViewers).where(eq(postViewers.postId, id));
    if (!post.circleId && nextVisibility === "selected") {
      await transaction.insert(postViewers).values(
        viewerIds.map((userId) => ({ postId: id, userId })),
      );
    }
    if (post.circleId) {
      await transaction
        .update(circles)
        .set({ updatedAt: now })
        .where(eq(circles.id, post.circleId));
    }
  });
  return NextResponse.json({ ok: true, updatedAt: now.toISOString() });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const post = await manageablePost(id, session.user.id);
  if (!post) return NextResponse.json({ error: "动态不存在或当前不可删除。" }, { status: 404 });

  const assets = await db
    .select({ id: mediaAssets.id })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
    .where(eq(postMedia.postId, id));

  await db.transaction(async (transaction) => {
    await transaction.delete(posts).where(eq(posts.id, id));
    if (post.circleId) {
      await transaction
        .update(circles)
        .set({ updatedAt: new Date() })
        .where(eq(circles.id, post.circleId));
    }
  });
  await Promise.all(
    assets.map((asset) => deleteMediaAsset(asset.id)),
  );
  return NextResponse.json({ ok: true });
}
