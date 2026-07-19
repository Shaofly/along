import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  circleMemberRelations,
  draftMedia,
  draftParticipants,
  drafts,
  draftViewers,
  mediaAssets,
  postMedia,
} from "@/db/schema";
import type { PostVisibility } from "@/lib/content-types";
import { assertActiveCircleMutation } from "@/lib/circles";
import { deleteDraftWithAssets } from "@/lib/drafts";
import { getFriends } from "@/lib/invitations";
import {
  cloneMediaAsset,
  deleteMediaAsset,
} from "@/lib/media/service";

export type SaveDraftInput = {
  id?: string;
  body: string;
  visibility: PostVisibility;
  circleId?: string | null;
  managementMode: "creator" | "circle";
  viewerIds: string[];
  participantIds: string[];
  mediaIds: string[];
  expectedUpdatedAt?: string;
};

export class DraftMutationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "draft_conflict",
  ) {
    super(message);
  }
}

type SaveDraftOptions = {
  allowUnavailableCircle?: boolean;
  retainedParticipantIds?: Set<string>;
  retainedViewerIds?: Set<string>;
};

export async function saveDraft(
  authorId: string,
  input: SaveDraftInput,
  options: SaveDraftOptions = {},
) {
  const mediaIds = [...new Set(input.mediaIds)];
  const viewerIds = [...new Set(input.viewerIds)].filter((id) => id !== authorId);
  const requestedCircleId = input.circleId ?? null;
  const requestedParticipantIds = requestedCircleId
    ? [...new Set([authorId, ...input.participantIds])]
    : [];
  if (!input.body.trim() && mediaIds.length === 0) {
    if (input.id) await deleteDraftWithAssets(authorId, input.id);
    return { id: null, updatedAt: null };
  }

  const existingRows = input.id
    ? await db
        .select({
          id: drafts.id,
          circleId: drafts.circleId,
          updatedAt: drafts.updatedAt,
        })
        .from(drafts)
        .where(and(eq(drafts.id, input.id), eq(drafts.authorId, authorId)))
        .limit(1)
    : [];
  const existing = existingRows[0] ?? null;
  if (input.id && !existing) {
    throw new DraftMutationError("草稿不存在。", 404, "draft_unavailable");
  }
  if (existing && existing.circleId !== requestedCircleId) {
    throw new DraftMutationError(
      "草稿保存后不能直接更换发布目标。你可以另存为一条新草稿。",
      409,
      "target_changed",
    );
  }

  const [existingViewerRows, existingParticipantRows, previousMedia] =
    existing
      ? await Promise.all([
          db
            .select({ userId: draftViewers.userId })
            .from(draftViewers)
            .where(eq(draftViewers.draftId, existing.id)),
          db
            .select({ userId: draftParticipants.userId })
            .from(draftParticipants)
            .where(eq(draftParticipants.draftId, existing.id)),
          db
            .select({ id: mediaAssets.id })
            .from(draftMedia)
            .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
            .where(eq(draftMedia.draftId, existing.id)),
        ])
      : [[], [], []];
  const existingViewerIds = new Set(
    [
      ...existingViewerRows.map((viewer) => viewer.userId),
      ...(options.retainedViewerIds ?? []),
    ],
  );
  const existingParticipantIds = new Set(
    [
      ...existingParticipantRows.map((participant) => participant.userId),
      ...(options.retainedParticipantIds ?? []),
    ],
  );

  if (!requestedCircleId && input.visibility === "selected") {
    const friends = await getFriends(authorId);
    const currentFriendIds = new Set(friends.map((friend) => friend.id));
    const invalidNewViewer = viewerIds.find(
      (viewerId) =>
        !currentFriendIds.has(viewerId) && !existingViewerIds.has(viewerId),
    );
    if (invalidNewViewer) {
      throw new DraftMutationError(
        "新增的指定可见者必须是你的当前朋友。",
        403,
        "invalid_viewer",
      );
    }
  }

  if (mediaIds.length) {
    const [ownedMedia, publishedLinks, draftLinks] = await Promise.all([
      db
        .select({ id: mediaAssets.id, status: mediaAssets.status })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.ownerId, authorId),
            inArray(mediaAssets.id, mediaIds),
          ),
        ),
      db
        .select({ id: postMedia.mediaId })
        .from(postMedia)
        .where(inArray(postMedia.mediaId, mediaIds)),
      db
        .select({ draftId: draftMedia.draftId, mediaId: draftMedia.mediaId })
        .from(draftMedia)
        .where(inArray(draftMedia.mediaId, mediaIds)),
    ]);
    if (
      ownedMedia.length !== mediaIds.length ||
      publishedLinks.length ||
      ownedMedia.some(
        (media) => media.status === "failed" || media.status === "deleting",
      ) ||
      draftLinks.some((link) => link.draftId !== existing?.id)
    ) {
      throw new DraftMutationError(
        "有图片无效或已经被其他内容使用。",
        400,
        "invalid_media",
      );
    }
  }

  const id = existing?.id ?? randomUUID();
  const removedMedia = previousMedia.filter(
    (media) => !mediaIds.includes(media.id),
  );
  let savedUpdatedAt: Date | null = null;

  await db.transaction(async (transaction) => {
    if (
      !existing &&
      requestedCircleId &&
      !options.allowUnavailableCircle
    ) {
      await assertActiveCircleMutation(transaction, authorId, requestedCircleId);
    }

    const lockedDraft = existing
      ? (
          await transaction
            .select({
              id: drafts.id,
              circleId: drafts.circleId,
              updatedAt: drafts.updatedAt,
            })
            .from(drafts)
            .where(and(eq(drafts.id, id), eq(drafts.authorId, authorId)))
            .limit(1)
            .for("update")
        )[0]
      : null;
    if (existing && !lockedDraft) {
      throw new DraftMutationError(
        "草稿已经被删除。",
        404,
        "draft_unavailable",
      );
    }
    if (lockedDraft && lockedDraft.circleId !== requestedCircleId) {
      throw new DraftMutationError(
        "草稿的发布目标已经发生变化。",
        409,
        "target_changed",
      );
    }
    if (lockedDraft && input.expectedUpdatedAt) {
      const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
      if (
        Number.isNaN(expectedUpdatedAt.getTime()) ||
        lockedDraft.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        throw new DraftMutationError(
          "这份草稿刚刚在另一处被修改了。",
          409,
          "draft_conflict",
        );
      }
    }

    if (requestedCircleId) {
      const activeMembers = await transaction
        .select({ userId: circleMemberRelations.userId })
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.circleId, requestedCircleId),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        );
      const activeMemberIds = new Set(
        activeMembers.map((member) => member.userId),
      );
      const invalidNewParticipant = requestedParticipantIds.find(
        (participantId) =>
          !activeMemberIds.has(participantId) &&
          !existingParticipantIds.has(participantId),
      );
      if (invalidNewParticipant) {
        throw new DraftMutationError(
          "新增参与者必须是当前圈子成员。",
          403,
          "invalid_participant",
        );
      }
    }

    const nextUpdatedAt = lockedDraft
      ? new Date(Math.max(Date.now(), lockedDraft.updatedAt.getTime() + 1))
      : new Date();
    if (lockedDraft) {
      await transaction
        .update(drafts)
        .set({
          body: input.body.trim(),
          visibility: requestedCircleId ? "private" : input.visibility,
          managementMode: requestedCircleId ? input.managementMode : "creator",
          updatedAt: nextUpdatedAt,
        })
        .where(eq(drafts.id, id));
      await Promise.all([
        transaction.delete(draftViewers).where(eq(draftViewers.draftId, id)),
        transaction
          .delete(draftParticipants)
          .where(eq(draftParticipants.draftId, id)),
        transaction.delete(draftMedia).where(eq(draftMedia.draftId, id)),
      ]);
    } else {
      await transaction.insert(drafts).values({
        id,
        authorId,
        body: input.body.trim(),
        circleId: requestedCircleId,
        visibility: requestedCircleId ? "private" : input.visibility,
        managementMode: requestedCircleId ? input.managementMode : "creator",
        createdAt: nextUpdatedAt,
        updatedAt: nextUpdatedAt,
      });
    }
    if (
      !requestedCircleId &&
      input.visibility === "selected" &&
      viewerIds.length
    ) {
      await transaction.insert(draftViewers).values(
        viewerIds.map((userId) => ({ draftId: id, userId })),
      );
    }
    if (requestedCircleId && requestedParticipantIds.length) {
      await transaction.insert(draftParticipants).values(
        requestedParticipantIds.map((userId) => ({ draftId: id, userId })),
      );
    }
    if (mediaIds.length) {
      await transaction.insert(draftMedia).values(
        mediaIds.map((mediaId, position) => ({
          draftId: id,
          mediaId,
          position,
        })),
      );
    }
    savedUpdatedAt = nextUpdatedAt;
  });

  await Promise.all(
    removedMedia.map((media) => deleteMediaAsset(media.id)),
  );
  return {
    id,
    updatedAt: savedUpdatedAt!.toISOString(),
  };
}

export async function forkDraft(
  authorId: string,
  sourceDraftId: string,
  input: SaveDraftInput,
) {
  const [source] = await db
    .select({ id: drafts.id, circleId: drafts.circleId })
    .from(drafts)
    .where(
      and(
        eq(drafts.id, sourceDraftId),
        eq(drafts.authorId, authorId),
      ),
    )
    .limit(1);
  if (!source) {
    throw new DraftMutationError(
      "原草稿已经不存在。",
      404,
      "draft_unavailable",
    );
  }
  if (source.circleId !== (input.circleId ?? null)) {
    throw new DraftMutationError(
      "另存草稿时不能改变发布目标。",
      409,
      "target_changed",
    );
  }

  const [sourceMediaRows, sourceViewerRows, sourceParticipantRows] =
    await Promise.all([
      db
        .select({
          id: mediaAssets.id,
          originalName: mediaAssets.originalName,
          mimeType: mediaAssets.mimeType,
        })
        .from(draftMedia)
        .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
        .where(eq(draftMedia.draftId, sourceDraftId)),
      db
        .select({ userId: draftViewers.userId })
        .from(draftViewers)
        .where(eq(draftViewers.draftId, sourceDraftId)),
      db
        .select({ userId: draftParticipants.userId })
        .from(draftParticipants)
        .where(eq(draftParticipants.draftId, sourceDraftId)),
    ]);
  const sourceMediaIds = new Set(sourceMediaRows.map((media) => media.id));
  const clonedMedia: Array<{
    id: string;
    originalName: string;
    mimeType: string;
  }> = [];
  const nextMediaIds: string[] = [];
  try {
    for (const mediaId of [...new Set(input.mediaIds)]) {
      if (!sourceMediaIds.has(mediaId)) {
        nextMediaIds.push(mediaId);
        continue;
      }
      const cloned = await cloneMediaAsset(mediaId, authorId);
      clonedMedia.push(cloned);
      nextMediaIds.push(cloned.id);
    }
    const result = await saveDraft(
      authorId,
      {
        ...input,
        id: undefined,
        expectedUpdatedAt: undefined,
        mediaIds: nextMediaIds,
      },
      {
        allowUnavailableCircle: Boolean(source.circleId),
        retainedParticipantIds: new Set(
          sourceParticipantRows.map((participant) => participant.userId),
        ),
        retainedViewerIds: new Set(
          sourceViewerRows.map((viewer) => viewer.userId),
        ),
      },
    );
    const nextMediaRows = nextMediaIds.length
      ? await db
          .select({
            id: mediaAssets.id,
            originalName: mediaAssets.originalName,
            mimeType: mediaAssets.mimeType,
          })
          .from(mediaAssets)
          .where(inArray(mediaAssets.id, nextMediaIds))
      : [];
    const nextMediaById = new Map(
      nextMediaRows.map((media) => [media.id, media]),
    );
    return {
      ...result,
      media: nextMediaIds.map((mediaId) => nextMediaById.get(mediaId)!),
    };
  } catch (error) {
    await Promise.all(
      clonedMedia.map((media) => deleteMediaAsset(media.id)),
    );
    throw error;
  }
}
