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
  draftViewers,
  mediaAssets,
  postMedia,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActiveCircleMembership } from "@/lib/circles";
import { deleteDraftWithAssets, getLatestDraft } from "@/lib/drafts";
import { getFriends } from "@/lib/invitations";
import { deleteMediaAsset } from "@/lib/media/service";

const saveDraftSchema = z.object({
  id: z.string().optional(),
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  circleId: z.string().nullable().optional(),
  managementMode: z.enum(["creator", "circle"]).default("creator"),
  viewerIds: z.array(z.string()).max(100).default([]),
  mediaIds: z.array(z.string()).max(20, "每条草稿最多 20 张图片").default([]),
});

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  return NextResponse.json({ draft: await getLatestDraft(session.user.id) });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const parsed = saveDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查草稿内容。" },
      { status: 400 },
    );
  }

  const mediaIds = [...new Set(parsed.data.mediaIds)];
  const viewerIds = [...new Set(parsed.data.viewerIds)].filter((id) => id !== session.user.id);
  const circleId = parsed.data.circleId ?? null;
  const existing = parsed.data.id
    ? await db
        .select({ id: drafts.id })
        .from(drafts)
        .where(and(eq(drafts.id, parsed.data.id), eq(drafts.authorId, session.user.id)))
        .limit(1)
    : [];
  if (parsed.data.id && !existing.length) {
    return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
  }
  if (!parsed.data.body && mediaIds.length === 0) {
    if (parsed.data.id) await deleteDraftWithAssets(session.user.id, parsed.data.id);
    return NextResponse.json({ ok: true, id: null });
  }

  if (circleId) {
    const [circle] = await db
      .select({ status: circles.status })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    const membership = await getActiveCircleMembership(session.user.id, circleId);
    if (!circle || circle.status !== "active" || !membership) {
      return NextResponse.json({ error: "当前不能为这个圈子保存草稿。" }, { status: 403 });
    }
  } else {
    const friends = await getFriends(session.user.id);
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!viewerIds.every((id) => friendIds.has(id))) {
      return NextResponse.json({ error: "指定可见者必须是你的朋友。" }, { status: 403 });
    }
  }

  if (mediaIds.length) {
    const [ownedMedia, publishedLinks, draftLinks] = await Promise.all([
      db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.ownerId, session.user.id), inArray(mediaAssets.id, mediaIds))),
      db.select({ id: postMedia.mediaId }).from(postMedia).where(inArray(postMedia.mediaId, mediaIds)),
      db
        .select({ draftId: draftMedia.draftId, mediaId: draftMedia.mediaId })
        .from(draftMedia)
        .where(inArray(draftMedia.mediaId, mediaIds)),
    ]);
    if (
      ownedMedia.length !== mediaIds.length ||
      publishedLinks.length ||
      draftLinks.some((link) => link.draftId !== parsed.data.id)
    ) {
      return NextResponse.json({ error: "有图片无效或已经被其他内容使用。" }, { status: 400 });
    }
  }

  const id = parsed.data.id ?? randomUUID();
  const previousMedia = parsed.data.id
    ? await db
        .select({ id: mediaAssets.id })
        .from(draftMedia)
        .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
        .where(eq(draftMedia.draftId, id))
    : [];
  const removedMedia = previousMedia.filter((media) => !mediaIds.includes(media.id));

  await db.transaction(async (transaction) => {
    if (parsed.data.id) {
      await transaction
        .update(drafts)
        .set({
          body: parsed.data.body,
          circleId,
          visibility: circleId ? "private" : parsed.data.visibility,
          managementMode: circleId ? parsed.data.managementMode : "creator",
          updatedAt: new Date(),
        })
        .where(eq(drafts.id, id));
      await transaction.delete(draftViewers).where(eq(draftViewers.draftId, id));
      await transaction.delete(draftMedia).where(eq(draftMedia.draftId, id));
    } else {
      await transaction.insert(drafts).values({
        id,
        authorId: session.user.id,
        body: parsed.data.body,
        circleId,
        visibility: circleId ? "private" : parsed.data.visibility,
        managementMode: circleId ? parsed.data.managementMode : "creator",
      });
    }
    if (!circleId && parsed.data.visibility === "selected" && viewerIds.length) {
      await transaction.insert(draftViewers).values(viewerIds.map((userId) => ({ draftId: id, userId })));
    }
    if (mediaIds.length) {
      await transaction.insert(draftMedia).values(
        mediaIds.map((mediaId, position) => ({ draftId: id, mediaId, position })),
      );
    }
  });
  await Promise.all(
    removedMedia.map((media) => deleteMediaAsset(media.id)),
  );

  return NextResponse.json({ ok: true, id });
}
