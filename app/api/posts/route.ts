import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  circles,
  draftMedia,
  drafts,
  mediaAssets,
  postMedia,
  posts,
  postViewers,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActiveCircleMembership } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";

const createPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  circleId: z.string().nullable().optional(),
  managementMode: z.enum(["creator", "circle"]).default("creator"),
  viewerIds: z.array(z.string()).max(100).default([]),
  mediaIds: z.array(z.string()).max(20, "每条动态最多 20 张图片").default([]),
  draftId: z.string().nullable().optional(),
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
  const circleId = parsed.data.circleId ?? null;
  const draftId = parsed.data.draftId ?? null;
  const viewerIds = [...new Set(parsed.data.viewerIds)].filter(
    (id) => id !== session.user.id,
  );
  if (!parsed.data.body && mediaIds.length === 0) {
    return NextResponse.json({ error: "写点什么，或者选择一张图片。" }, { status: 400 });
  }
  if (!circleId && parsed.data.visibility === "selected" && viewerIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一位朋友。" }, { status: 400 });
  }

  if (circleId) {
    const [circle] = await db
      .select({ status: circles.status })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    const membership = await getActiveCircleMembership(session.user.id, circleId);
    if (!circle || circle.status !== "active" || !membership) {
      return NextResponse.json({ error: "当前不能向这个圈子发布内容。" }, { status: 403 });
    }
  } else {
    const friends = await getFriends(session.user.id);
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!viewerIds.every((id) => friendIds.has(id))) {
      return NextResponse.json({ error: "指定可见者必须是你的朋友。" }, { status: 403 });
    }
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

  if (draftId) {
    const [draft] = await db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, session.user.id)))
      .limit(1);
    if (!draft) return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
    const linkedMedia = await db
      .select({ id: draftMedia.mediaId })
      .from(draftMedia)
      .where(eq(draftMedia.draftId, draftId));
    const linkedIds = linkedMedia.map((media) => media.id);
    if (linkedIds.length !== mediaIds.length || linkedIds.some((id) => !mediaIds.includes(id))) {
      return NextResponse.json({ error: "草稿照片尚未同步完成。" }, { status: 409 });
    }
  }

  const id = randomUUID();
  await db.transaction(async (transaction) => {
    await transaction.insert(posts).values({
      id,
      authorId: session.user.id,
      circleId,
      body: parsed.data.body,
      visibility: circleId ? "private" : parsed.data.visibility,
      managementMode: circleId ? parsed.data.managementMode : "creator",
    });
    if (!circleId && parsed.data.visibility === "selected") {
      await transaction.insert(postViewers).values(
        viewerIds.map((userId) => ({ postId: id, userId })),
      );
    }
    if (mediaIds.length > 0) {
      await transaction.insert(postMedia).values(
        mediaIds.map((mediaId, position) => ({ postId: id, mediaId, position })),
      );
    }
    if (circleId) {
      await transaction
        .update(circles)
        .set({ updatedAt: new Date() })
        .where(eq(circles.id, circleId));
    }
    if (draftId) {
      await transaction.delete(drafts).where(eq(drafts.id, draftId));
    }
  });

  return NextResponse.json({ ok: true, id });
}
