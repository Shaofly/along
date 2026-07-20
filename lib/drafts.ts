import "server-only";

import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";

import { db } from "@/db";
import {
  circleMemberRelations,
  circles,
  draftMedia,
  draftParticipants,
  drafts,
  draftViewers,
  mediaAssets,
  mediaVariants,
  user,
} from "@/db/schema";
import type {
  DraftCircleTarget,
  DraftDetail,
  DraftMedia,
  DraftParticipant,
  DraftSummary,
} from "@/lib/content-types";
import { deleteMediaAsset } from "@/lib/media/service";

export type DraftTargetFilter = "all" | "personal" | "circle";

type DraftListOptions = {
  circleId?: string;
  limit?: number;
  page?: number;
  target?: DraftTargetFilter;
};

function availability(
  circle: DraftCircleTarget | null,
): { canPublish: boolean; unavailableReason: string | null } {
  if (!circle) return { canPublish: true, unavailableReason: null };
  if (circle.status === "frozen") {
    return {
      canPublish: false,
      unavailableReason: "圈子已冻结，草稿仍会为你保留，但暂时不能发布。",
    };
  }
  if (circle.status === "dissolved") {
    return {
      canPublish: false,
      unavailableReason: "圈子已经结束，这份草稿只能继续整理、复制或删除。",
    };
  }
  if (!circle.isActiveMember) {
    return {
      canPublish: false,
      unavailableReason: "你已经不是这个圈子的当前成员，这份草稿不能再发布。",
    };
  }
  return { canPublish: true, unavailableReason: null };
}

async function mediaForDrafts(draftIds: string[]) {
  const mediaByDraft = new Map<string, DraftMedia[]>();
  if (!draftIds.length) return mediaByDraft;
  const rows = await db
    .select({
      draftId: draftMedia.draftId,
      id: mediaAssets.id,
      originalName: mediaAssets.originalName,
      mimeType: mediaAssets.mimeType,
      position: draftMedia.position,
      width: mediaVariants.width,
      height: mediaVariants.height,
      sourceWidth: mediaAssets.sourceWidth,
      sourceHeight: mediaAssets.sourceHeight,
    })
    .from(draftMedia)
    .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
    .leftJoin(
      mediaVariants,
      and(
        eq(mediaVariants.mediaId, mediaAssets.id),
        eq(mediaVariants.variantType, "thumbnail"),
      ),
    )
    .where(inArray(draftMedia.draftId, draftIds))
    .orderBy(draftMedia.position);
  for (const row of rows) {
    const list = mediaByDraft.get(row.draftId) ?? [];
    list.push({
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      width: row.width ?? row.sourceWidth ?? 1,
      height: row.height ?? row.sourceHeight ?? 1,
    });
    mediaByDraft.set(row.draftId, list);
  }
  return mediaByDraft;
}

export async function getDraftCount(authorId: string) {
  const [result] = await db
    .select({ value: count() })
    .from(drafts)
    .where(eq(drafts.authorId, authorId));
  return result?.value ?? 0;
}

export async function getDraftList(
  authorId: string,
  options: DraftListOptions = {},
): Promise<{
  drafts: DraftSummary[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(60, Math.max(1, options.limit ?? 24));
  const target = options.target ?? "all";
  const condition = and(
    eq(drafts.authorId, authorId),
    options.circleId ? eq(drafts.circleId, options.circleId) : undefined,
    target === "personal"
      ? isNull(drafts.circleId)
      : target === "circle"
        ? isNotNull(drafts.circleId)
        : undefined,
  );
  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(drafts).where(condition),
    db
      .select({
        id: drafts.id,
        body: drafts.body,
        visibility: drafts.visibility,
        circleId: drafts.circleId,
        managementMode: drafts.managementMode,
        photoLayout: drafts.photoLayout,
        createdAt: drafts.createdAt,
        updatedAt: drafts.updatedAt,
        circleName: circles.name,
        circleStatus: circles.status,
      })
      .from(drafts)
      .leftJoin(circles, eq(drafts.circleId, circles.id))
      .where(condition)
      .orderBy(desc(drafts.updatedAt), desc(drafts.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);
  const total = totalResult[0]?.value ?? 0;
  if (!rows.length) {
    return {
      drafts: [],
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  const circleIds = [
    ...new Set(
      rows
        .map((row) => row.circleId)
        .filter((circleId): circleId is string => Boolean(circleId)),
    ),
  ];
  const [mediaByDraft, membershipRows] = await Promise.all([
    mediaForDrafts(rows.map((row) => row.id)),
    circleIds.length
      ? db
          .select({ circleId: circleMemberRelations.circleId })
          .from(circleMemberRelations)
          .where(
            and(
              eq(circleMemberRelations.userId, authorId),
              inArray(circleMemberRelations.circleId, circleIds),
              isNotNull(circleMemberRelations.activePeriodId),
            ),
          )
      : Promise.resolve([]),
  ]);
  const activeCircleIds = new Set(
    membershipRows.map((membership) => membership.circleId),
  );

  return {
    drafts: rows.map((row) => {
      const circle =
        row.circleId && row.circleName && row.circleStatus
          ? {
              id: row.circleId,
              name: row.circleName,
              status: row.circleStatus,
              isActiveMember: activeCircleIds.has(row.circleId),
            }
          : null;
      const media = mediaByDraft.get(row.id) ?? [];
      return {
        id: row.id,
        body: row.body,
        visibility: row.visibility,
        circleId: row.circleId,
        circle,
        managementMode: row.managementMode,
        photoLayout: row.photoLayout,
        media,
        mediaCount: media.length,
        ...availability(circle),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
    total,
  };
}

export async function getDraftDetail(
  authorId: string,
  draftId: string,
): Promise<DraftDetail | null> {
  const [row] = await db
    .select({
      id: drafts.id,
      body: drafts.body,
      visibility: drafts.visibility,
      circleId: drafts.circleId,
      managementMode: drafts.managementMode,
      photoLayout: drafts.photoLayout,
      createdAt: drafts.createdAt,
      updatedAt: drafts.updatedAt,
      circleName: circles.name,
      circleStatus: circles.status,
    })
    .from(drafts)
    .leftJoin(circles, eq(drafts.circleId, circles.id))
    .where(and(eq(drafts.id, draftId), eq(drafts.authorId, authorId)))
    .limit(1);
  if (!row) return null;

  const [mediaByDraft, viewerRows, selectedParticipantRows, activeMemberRows] =
    await Promise.all([
      mediaForDrafts([draftId]),
      db
        .select({ userId: draftViewers.userId })
        .from(draftViewers)
        .where(eq(draftViewers.draftId, draftId)),
      db
        .select({
          id: user.id,
          name: user.name,
          realName: user.realName,
        })
        .from(draftParticipants)
        .innerJoin(user, eq(draftParticipants.userId, user.id))
        .where(eq(draftParticipants.draftId, draftId)),
      row.circleId
        ? db
            .select({
              id: user.id,
              name: user.name,
              realName: user.realName,
            })
            .from(circleMemberRelations)
            .innerJoin(user, eq(circleMemberRelations.userId, user.id))
            .where(
              and(
                eq(circleMemberRelations.circleId, row.circleId),
                isNotNull(circleMemberRelations.activePeriodId),
              ),
            )
        : Promise.resolve([]),
    ]);
  const activeMemberIds = new Set(activeMemberRows.map((member) => member.id));
  const circle =
    row.circleId && row.circleName && row.circleStatus
      ? {
          id: row.circleId,
          name: row.circleName,
          status: row.circleStatus,
          isActiveMember: activeMemberIds.has(authorId),
        }
      : null;
  const participants: DraftParticipant[] = selectedParticipantRows.map(
    (participant) => ({
      ...participant,
      isActive: activeMemberIds.has(participant.id),
    }),
  );
  const circleMembers: DraftParticipant[] = activeMemberRows.map((member) => ({
    ...member,
    isActive: true,
  }));
  const media = mediaByDraft.get(draftId) ?? [];

  return {
    id: row.id,
    body: row.body,
    visibility: row.visibility,
    circleId: row.circleId,
    circle,
    managementMode: row.managementMode,
    photoLayout: row.photoLayout,
    media,
    mediaCount: media.length,
    viewerIds: viewerRows.map((viewer) => viewer.userId),
    participants,
    circleMembers,
    ...availability(circle),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteDraftWithAssets(authorId: string, draftId: string) {
  const [draft] = await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.authorId, authorId)))
    .limit(1);
  if (!draft) return false;

  const linkedMedia = await db
    .select({ id: mediaAssets.id })
    .from(draftMedia)
    .innerJoin(mediaAssets, eq(draftMedia.mediaId, mediaAssets.id))
    .where(eq(draftMedia.draftId, draftId));
  await db.delete(drafts).where(eq(drafts.id, draftId));
  await Promise.all(linkedMedia.map((media) => deleteMediaAsset(media.id)));
  return true;
}
