import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  circles,
  circleMemberRelations,
  mediaAssets,
  postMedia,
  postParticipants,
  posts,
  postViewers,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { photoLayoutSchema } from "@/lib/draft-contracts";
import {
  assertActiveCircleMutation,
  getActiveCircleMembership,
} from "@/lib/circles";
import { getFriends } from "@/lib/invitations";
import { deleteMediaAsset } from "@/lib/media/service";
import { normalizePhotoLayout } from "@/lib/photo-layout";

const editPostSchema = z.object({
  body: z.string().trim().max(5000, "正文不能超过 5000 个字"),
  visibility: z.enum(["friends", "selected", "private"]).optional(),
  viewerIds: z.array(z.string()).max(100).default([]),
  participantIds: z.array(z.string()).max(10).optional(),
  managementMode: z.enum(["creator", "circle"]).optional(),
  mediaIds: z.array(z.string()).max(20).optional(),
  photoLayout: photoLayoutSchema.nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
});

type PostMutationErrorCode =
  | "actor_inactive"
  | "circle_unavailable"
  | "invalid_content"
  | "invalid_management"
  | "participants_changed"
  | "post_conflict"
  | "post_unavailable"
  | "temporary_failure";

class PostMutationError extends Error {
  constructor(
    readonly code: PostMutationErrorCode,
    message: string,
    readonly status = 409,
    readonly terminal = true,
  ) {
    super(message);
  }
}

function mutationErrorResponse(error: unknown) {
  if (error instanceof PostMutationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        terminal: error.terminal,
      },
      { status: error.status },
    );
  }
  const message =
    error instanceof Error ? error.message : "圈子状态已经发生变化。";
  if (
    message === "这个圈子目前不能修改。" ||
    message === "只有当前活跃成员可以修改这个圈子。"
  ) {
    const code: PostMutationErrorCode =
      message === "这个圈子目前不能修改。"
        ? "circle_unavailable"
        : "actor_inactive";
    return NextResponse.json(
      { error: message, code, terminal: true },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: "保存时遇到临时问题，请稍后重试。",
      code: "temporary_failure",
      terminal: false,
    },
    { status: 500 },
  );
}

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
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const { id } = await context.params;
  const post = await manageablePost(id, session.user.id);
  if (!post) {
    return NextResponse.json(
      {
        error: "动态不存在或当前不可修改。",
        code: "post_unavailable",
        terminal: true,
      },
      { status: 404 },
    );
  }

  const parsed = editPostSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查动态内容。" },
      { status: 400 },
    );
  }

  const nextVisibility = post.circleId
    ? "private"
    : (parsed.data.visibility ?? post.visibility);
  const viewerIds = [...new Set(parsed.data.viewerIds)].filter(
    (viewerId) => viewerId !== session.user.id,
  );
  if (!post.circleId && nextVisibility === "selected") {
    if (viewerIds.length === 0) {
      return NextResponse.json(
        { error: "请至少选择一位朋友。" },
        { status: 400 },
      );
    }
    const friends = await getFriends(session.user.id);
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!viewerIds.every((viewerId) => friendIds.has(viewerId))) {
      return NextResponse.json(
        { error: "指定可见者必须是你的朋友。" },
        { status: 403 },
      );
    }
  }

  const expectedUpdatedAt = new Date(parsed.data.expectedUpdatedAt);
  let savedUpdatedAt: Date | null = null;
  try {
    await db.transaction(async (transaction) => {
      if (post.circleId) {
        await assertActiveCircleMutation(
          transaction,
          session.user.id,
          post.circleId,
        );
      }

      const [lockedPost] = await transaction
        .select({
          id: posts.id,
          authorId: posts.authorId,
          circleId: posts.circleId,
          managementMode: posts.managementMode,
          photoLayout: posts.photoLayout,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1)
        .for("update");
      const canManageLockedPost = Boolean(
        lockedPost &&
          (lockedPost.circleId
            ? lockedPost.circleId === post.circleId &&
              (lockedPost.managementMode === "circle" ||
                lockedPost.authorId === session.user.id)
            : lockedPost.authorId === session.user.id),
      );
      if (!lockedPost || !canManageLockedPost) {
        throw new PostMutationError(
          "post_unavailable",
          "动态不存在或当前不可修改。",
          404,
        );
      }
      if (lockedPost.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new PostMutationError(
          "post_conflict",
          "这条记录刚刚被其他成员修改了。请先复制需要保留的内容，再取消本次修改并重新打开。",
        );
      }

      const existingMedia = await transaction
        .select({
          id: postMedia.mediaId,
          width: mediaAssets.sourceWidth,
          height: mediaAssets.sourceHeight,
        })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
        .where(eq(postMedia.postId, id))
        .orderBy(postMedia.position);
      if (!parsed.data.body && existingMedia.length === 0) {
        throw new PostMutationError(
          "invalid_content",
          "动态内容不能为空。",
          400,
          false,
        );
      }
      const existingMediaIds = existingMedia.map((media) => media.id);
      const nextMediaIds = parsed.data.mediaIds ?? existingMediaIds;
      const nextMediaIdSet = new Set(nextMediaIds);
      if (
        nextMediaIds.length !== existingMediaIds.length ||
        nextMediaIdSet.size !== nextMediaIds.length ||
        existingMediaIds.some((mediaId) => !nextMediaIdSet.has(mediaId))
      ) {
        throw new PostMutationError(
          "invalid_content",
          "已发布照片只能调整顺序，不能增加或删除。",
          400,
          false,
        );
      }
      const mediaById = new Map(existingMedia.map((media) => [media.id, media]));
      const nextPhotoLayout = normalizePhotoLayout(
        parsed.data.photoLayout ?? lockedPost.photoLayout,
        nextMediaIds.map((mediaId) => {
          const media = mediaById.get(mediaId);
          return (media?.width ?? 1) / (media?.height ?? 1);
        }),
      );

      let nextManagementMode = lockedPost.managementMode;
      if (lockedPost.circleId && parsed.data.managementMode) {
        if (
          lockedPost.managementMode === "circle" &&
          parsed.data.managementMode === "creator"
        ) {
          throw new PostMutationError(
            "invalid_management",
            "共同管理不能再改回仅创建者管理。",
            400,
            false,
          );
        }
        if (
          lockedPost.managementMode === "creator" &&
          parsed.data.managementMode === "circle" &&
          lockedPost.authorId !== session.user.id
        ) {
          throw new PostMutationError(
            "invalid_management",
            "只有创建者可以升级管理方式。",
            403,
            false,
          );
        }
        nextManagementMode = parsed.data.managementMode;
      }

      let participantIds: string[] | undefined;
      let existingParticipantIds: string[] = [];
      const lockedCircleId = lockedPost.circleId;
      if (lockedCircleId && parsed.data.participantIds) {
        participantIds = [
          ...new Set([lockedPost.authorId, ...parsed.data.participantIds]),
        ];
        const [activeMembers, existingParticipants] = await Promise.all([
          transaction
            .select({ userId: circleMemberRelations.userId })
            .from(circleMemberRelations)
            .where(
              and(
                eq(circleMemberRelations.circleId, lockedCircleId),
                isNotNull(circleMemberRelations.activePeriodId),
              ),
            ),
          transaction
            .select({ userId: postParticipants.userId })
            .from(postParticipants)
            .where(eq(postParticipants.postId, id)),
        ]);
        existingParticipantIds = existingParticipants.map(
          (participant) => participant.userId,
        );
        const activeMemberIds = new Set(
          activeMembers.map((member) => member.userId),
        );
        const existingParticipantIdSet = new Set(existingParticipantIds);
        const invalidNewParticipant = participantIds.find(
          (userId) =>
            !existingParticipantIdSet.has(userId) &&
            !activeMemberIds.has(userId),
        );
        if (invalidNewParticipant) {
          throw new PostMutationError(
            "participants_changed",
            "有新参与者已经不在圈子中。请先复制需要保留的内容，再取消本次修改并重新打开。",
          );
        }
      }

      const nextUpdatedAt = new Date(
        Math.max(Date.now(), lockedPost.updatedAt.getTime() + 1),
      );
      const updated = await transaction
        .update(posts)
        .set({
          body: parsed.data.body,
          visibility: lockedCircleId ? "private" : nextVisibility,
          managementMode: nextManagementMode,
          photoLayout: nextPhotoLayout,
          lastEditedById: session.user.id,
          updatedAt: nextUpdatedAt,
        })
        .where(
          and(
            eq(posts.id, id),
            sql`date_trunc('milliseconds', ${posts.updatedAt}) = ${expectedUpdatedAt}`,
          ),
        )
        .returning({ updatedAt: posts.updatedAt });
      if (!updated.length) {
        throw new PostMutationError(
          "post_conflict",
          "这条记录刚刚被其他成员修改了。请先复制需要保留的内容，再取消本次修改并重新打开。",
        );
      }
      savedUpdatedAt = updated[0]!.updatedAt;

      if (parsed.data.mediaIds) {
        await transaction.delete(postMedia).where(eq(postMedia.postId, id));
        if (nextMediaIds.length) {
          await transaction.insert(postMedia).values(
            nextMediaIds.map((mediaId, position) => ({
              postId: id,
              mediaId,
              position,
            })),
          );
        }
      }

      await transaction.delete(postViewers).where(eq(postViewers.postId, id));
      if (!lockedCircleId && nextVisibility === "selected") {
        await transaction.insert(postViewers).values(
          viewerIds.map((userId) => ({ postId: id, userId })),
        );
      }
      if (lockedCircleId && participantIds) {
        const nextParticipantIdSet = new Set(participantIds);
        const existingParticipantIdSet = new Set(existingParticipantIds);
        const removedParticipantIds = existingParticipantIds.filter(
          (userId) => !nextParticipantIdSet.has(userId),
        );
        const addedParticipantIds = participantIds.filter(
          (userId) => !existingParticipantIdSet.has(userId),
        );
        if (removedParticipantIds.length) {
          await transaction
            .delete(postParticipants)
            .where(
              and(
                eq(postParticipants.postId, id),
                inArray(postParticipants.userId, removedParticipantIds),
              ),
            );
        }
        if (addedParticipantIds.length) {
          await transaction.insert(postParticipants).values(
            addedParticipantIds.map((userId) => ({
              postId: id,
              userId,
              addedById: session.user.id,
            })),
          );
        }
      }
      if (lockedCircleId) {
        await transaction
          .update(circles)
          .set({ updatedAt: nextUpdatedAt })
          .where(eq(circles.id, lockedCircleId));
      }
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }

  return NextResponse.json({
    ok: true,
    updatedAt: savedUpdatedAt!.toISOString(),
  });
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
  const post = await manageablePost(id, session.user.id);
  if (!post) {
    return NextResponse.json(
      { error: "动态不存在或当前不可删除。" },
      { status: 404 },
    );
  }

  const assets = await db
    .select({ id: mediaAssets.id })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.mediaId, mediaAssets.id))
    .where(eq(postMedia.postId, id));

  try {
    await db.transaction(async (transaction) => {
      if (post.circleId) {
        await assertActiveCircleMutation(
          transaction,
          session.user.id,
          post.circleId,
        );
      }
      await transaction.delete(posts).where(eq(posts.id, id));
      if (post.circleId) {
        await transaction
          .update(circles)
          .set({ updatedAt: new Date() })
          .where(eq(circles.id, post.circleId));
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
  await Promise.all(assets.map((asset) => deleteMediaAsset(asset.id)));
  return NextResponse.json({ ok: true });
}
