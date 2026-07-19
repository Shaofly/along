import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  circles,
  circleMemberRelations,
  draftMedia,
  draftParticipants,
  drafts,
  draftViewers,
  mediaAssets,
  postMedia,
  postParticipants,
  posts,
  postViewers,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  assertActiveCircleMutation,
  getActiveCircleMembership,
} from "@/lib/circles";
import { getFriends } from "@/lib/invitations";

const createPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]),
  circleId: z.string().nullable().optional(),
  managementMode: z.enum(["creator", "circle"]).default("creator"),
  viewerIds: z.array(z.string()).max(100).default([]),
  participantIds: z.array(z.string()).max(10).default([]),
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
  const participantIds = circleId
    ? [...new Set([session.user.id, ...parsed.data.participantIds])]
    : [];
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
    const activeMembers = await db
      .select({ userId: circleMemberRelations.userId })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, circleId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    const activeMemberIds = new Set(activeMembers.map((member) => member.userId));
    if (!participantIds.every((id) => activeMemberIds.has(id))) {
      return NextResponse.json({ error: "参与者必须是当前圈子成员。" }, { status: 403 });
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
      .select({ id: mediaAssets.id, status: mediaAssets.status })
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
    if (
      ownedMedia.length !== mediaIds.length ||
      existingLinks.length > 0 ||
      ownedMedia.some((media) => media.status === "failed" || media.status === "deleting")
    ) {
      return NextResponse.json({ error: "有图片无效或已经发布。" }, { status: 400 });
    }
  }

  if (draftId) {
    const [draft] = await db
      .select({
        id: drafts.id,
        body: drafts.body,
        circleId: drafts.circleId,
        visibility: drafts.visibility,
        managementMode: drafts.managementMode,
      })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.authorId, session.user.id)))
      .limit(1);
    if (!draft) return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
    if (
      draft.circleId !== circleId ||
      draft.body !== parsed.data.body ||
      draft.visibility !== (circleId ? "private" : parsed.data.visibility) ||
      draft.managementMode !==
        (circleId ? parsed.data.managementMode : "creator")
    ) {
      return NextResponse.json(
        { error: "草稿内容或发布目标尚未同步完成。" },
        { status: 409 },
      );
    }
    const [linkedMedia, linkedViewers, linkedParticipants] = await Promise.all([
      db
        .select({ id: draftMedia.mediaId })
        .from(draftMedia)
        .where(eq(draftMedia.draftId, draftId)),
      db
        .select({ id: draftViewers.userId })
        .from(draftViewers)
        .where(eq(draftViewers.draftId, draftId)),
      db
        .select({ id: draftParticipants.userId })
        .from(draftParticipants)
        .where(eq(draftParticipants.draftId, draftId)),
    ]);
    const linkedIds = linkedMedia.map((media) => media.id);
    if (linkedIds.length !== mediaIds.length || linkedIds.some((id) => !mediaIds.includes(id))) {
      return NextResponse.json({ error: "草稿照片尚未同步完成。" }, { status: 409 });
    }
    const linkedViewerIds = linkedViewers.map((viewer) => viewer.id);
    if (
      !circleId &&
      (linkedViewerIds.length !== viewerIds.length ||
        linkedViewerIds.some((id) => !viewerIds.includes(id)))
    ) {
      return NextResponse.json(
        { error: "草稿的可见范围尚未同步完成。" },
        { status: 409 },
      );
    }
    const linkedParticipantIds = linkedParticipants.map(
      (participant) => participant.id,
    );
    if (
      circleId &&
      (linkedParticipantIds.length !== participantIds.length ||
        linkedParticipantIds.some((id) => !participantIds.includes(id)))
    ) {
      return NextResponse.json(
        { error: "草稿的参与者尚未同步完成。" },
        { status: 409 },
      );
    }
  }

  const id = randomUUID();
  const mediaRows = mediaIds.length
    ? await db
        .select({ status: mediaAssets.status })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, mediaIds))
    : [];
  const publicationStatus = mediaRows.some((media) => media.status !== "ready")
    ? "publishing" as const
    : "published" as const;
  const now = new Date();
  try {
    await db.transaction(async (transaction) => {
      if (circleId) {
        await assertActiveCircleMutation(
          transaction,
          session.user.id,
          circleId,
        );
        const currentMembers = await transaction
          .select({ userId: circleMemberRelations.userId })
          .from(circleMemberRelations)
          .where(
            and(
              eq(circleMemberRelations.circleId, circleId),
              isNotNull(circleMemberRelations.activePeriodId),
            ),
          );
        const currentMemberIds = new Set(
          currentMembers.map((member) => member.userId),
        );
        if (!participantIds.every((id) => currentMemberIds.has(id))) {
          throw new Error("参与者必须是当前圈子成员。");
        }
      }
      await transaction.insert(posts).values({
      id,
      authorId: session.user.id,
      circleId,
      body: parsed.data.body,
      visibility: circleId ? "private" : parsed.data.visibility,
      managementMode: circleId ? parsed.data.managementMode : "creator",
      publicationStatus,
      publishedAt: publicationStatus === "published" ? now : null,
    });
      if (!circleId && parsed.data.visibility === "selected") {
        await transaction.insert(postViewers).values(
        viewerIds.map((userId) => ({ postId: id, userId })),
        );
      }
      if (circleId) {
        await transaction.insert(postParticipants).values(
        participantIds.map((userId) => ({
          postId: id,
          userId,
          addedById: session.user.id,
        })),
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "圈子状态已经发生变化。",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, id, publicationStatus });
}
