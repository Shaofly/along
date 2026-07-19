import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  circleEvents,
  circleCreationInvitees,
  circleCreationRequests,
  circleExitSnapshotMedia,
  circleExitSnapshotPosts,
  circleExitSnapshots,
  circleJoinProposals,
  circleMemberRelations,
  circleMembershipPeriods,
  circleProposalApprovals,
  circles,
  draftMedia,
  drafts,
  mediaAssets,
  postMedia,
  posts,
  user,
} from "@/db/schema";
import { deleteMediaAsset } from "@/lib/media/service";

const activeProposalStatuses = ["pending_approval", "awaiting_candidate"] as const;
const maximumCircleMembers = 10;
const hourInMilliseconds = 60 * 60 * 1000;
const dayInMilliseconds = 24 * hourInMilliseconds;
const failedCreationResultRetention = 7 * dayInMilliseconds;

function threeDaysFromNow() {
  return new Date(Date.now() + 3 * dayInMilliseconds);
}

function oneDayFrom(date: Date) {
  return new Date(date.getTime() + dayInMilliseconds);
}

function getCircleDeleteAt(createdAt: Date, frozenAt: Date) {
  const age = frozenAt.getTime() - createdAt.getTime();
  const grace =
    age < 3 * dayInMilliseconds
      ? hourInMilliseconds
      : age < 7 * dayInMilliseconds
        ? dayInMilliseconds
        : age < 30 * dayInMilliseconds
          ? 3 * dayInMilliseconds
          : age < 90 * dayInMilliseconds
            ? 7 * dayInMilliseconds
            : age < 180 * dayInMilliseconds
              ? 14 * dayInMilliseconds
              : 30 * dayInMilliseconds;
  return new Date(frozenAt.getTime() + grace);
}

function firstAvailableSlot(usedSlots: number[]) {
  const used = new Set(usedSlots);
  for (let slot = 1; slot <= maximumCircleMembers; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

async function getExitArchiveMediaIds(snapshotId: string) {
  const rows = await db
    .select({ mediaId: circleExitSnapshotMedia.mediaId })
    .from(circleExitSnapshotMedia)
    .innerJoin(
      circleExitSnapshotPosts,
      eq(circleExitSnapshotMedia.snapshotPostId, circleExitSnapshotPosts.id),
    )
    .where(eq(circleExitSnapshotPosts.exitSnapshotId, snapshotId));
  return [...new Set(rows.map((row) => row.mediaId))];
}

type CircleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function settleCircleCreationRequest(
  transaction: CircleTransaction,
  requestId: string,
  now: Date,
) {
  const [request] = await transaction
    .select()
    .from(circleCreationRequests)
    .where(eq(circleCreationRequests.id, requestId))
    .limit(1)
    .for("update");
  if (!request || request.status !== "pending") {
    return request?.formedCircleId ?? null;
  }

  if (now >= request.expiresAt) {
    await transaction
      .update(circleCreationInvitees)
      .set({ status: "expired", resolvedAt: now })
      .where(
        and(
          eq(circleCreationInvitees.requestId, requestId),
          eq(circleCreationInvitees.status, "pending"),
        ),
      );
  }

  const invitees = await transaction
    .select({
      candidateId: circleCreationInvitees.candidateId,
      status: circleCreationInvitees.status,
    })
    .from(circleCreationInvitees)
    .where(eq(circleCreationInvitees.requestId, requestId))
    .orderBy(asc(circleCreationInvitees.candidateId));
  if (invitees.some((invitee) => invitee.status === "pending")) return null;

  const acceptedUserIds = invitees
    .filter((invitee) => invitee.status === "accepted")
    .map((invitee) => invitee.candidateId);
  if (acceptedUserIds.length === 0) {
    await transaction
      .update(circleCreationRequests)
      .set({
        status: "failed",
        resolvedAt: now,
        purgeAt: new Date(now.getTime() + failedCreationResultRetention),
      })
      .where(
        and(
          eq(circleCreationRequests.id, requestId),
          eq(circleCreationRequests.status, "pending"),
        ),
      );
    return null;
  }

  const circleId = randomUUID();
  const memberIds = [request.creatorId, ...acceptedUserIds];
  const memberships = memberIds.map((userId, index) => ({
    userId,
    relationId: randomUUID(),
    periodId: randomUUID(),
    slot: index + 1,
  }));
  await transaction.insert(circles).values({
    id: circleId,
    name: request.name,
    description: request.description,
    status: "active",
    createdById: request.creatorId,
    createdAt: now,
    updatedAt: now,
  });
  await transaction.insert(circleMemberRelations).values(
    memberships.map((membership) => ({
      id: membership.relationId,
      circleId,
      userId: membership.userId,
      historyVisibleFrom: now,
      createdAt: now,
    })),
  );
  await transaction.insert(circleMembershipPeriods).values(
    memberships.map((membership) => ({
      id: membership.periodId,
      relationId: membership.relationId,
      joinedAt: now,
      lastViewedAt: now,
    })),
  );
  for (const membership of memberships) {
    await transaction
      .update(circleMemberRelations)
      .set({
        activePeriodId: membership.periodId,
        activeSlot: membership.slot,
      })
      .where(eq(circleMemberRelations.id, membership.relationId));
  }
  await transaction.insert(circleEvents).values({
    id: randomUUID(),
    circleId,
    actorId: request.creatorId,
    type: "circle_created",
    message: `${memberIds.length} 位朋友共同建立了这个小圈子。`,
    createdAt: now,
  });
  await transaction
    .update(circleCreationRequests)
    .set({
      status: "formed",
      formedCircleId: circleId,
      resolvedAt: now,
    })
    .where(
      and(
        eq(circleCreationRequests.id, requestId),
        eq(circleCreationRequests.status, "pending"),
      ),
    );
  return circleId;
}

export async function settleExpiredCircleCreationRequests(now = new Date()) {
  const expired = await db
    .select({ id: circleCreationRequests.id })
    .from(circleCreationRequests)
    .where(
      and(
        eq(circleCreationRequests.status, "pending"),
        lte(circleCreationRequests.expiresAt, now),
      ),
    )
    .limit(100);
  for (const request of expired) {
    await db.transaction((transaction) =>
      settleCircleCreationRequest(transaction, request.id, now),
    );
  }
  await db
    .delete(circleCreationRequests)
    .where(
      and(
        eq(circleCreationRequests.status, "failed"),
        lte(circleCreationRequests.purgeAt, now),
      ),
    );
  return expired.length;
}

export async function expireCircleProposals(now = new Date()) {
  const expired = await db
    .select({
      id: circleJoinProposals.id,
      circleId: circleJoinProposals.circleId,
    })
    .from(circleJoinProposals)
    .where(
      and(
        inArray(circleJoinProposals.status, [...activeProposalStatuses]),
        lte(circleJoinProposals.expiresAt, now),
      ),
    )
    .limit(100);
  for (const proposal of expired) {
    await db.transaction(async (transaction) => {
      await transaction
        .select({ id: circles.id })
        .from(circles)
        .where(eq(circles.id, proposal.circleId))
        .limit(1)
        .for("update");
      await transaction
        .update(circleJoinProposals)
        .set({ status: "expired", resolvedAt: now })
        .where(
          and(
            eq(circleJoinProposals.id, proposal.id),
            inArray(circleJoinProposals.status, [...activeProposalStatuses]),
            lte(circleJoinProposals.expiresAt, now),
          ),
        );
    });
  }
  return expired.length;
}

export async function getCircleRelation(userId: string, circleId: string) {
  const [relation] = await db
    .select()
    .from(circleMemberRelations)
    .where(
      and(
        eq(circleMemberRelations.userId, userId),
        eq(circleMemberRelations.circleId, circleId),
      ),
    )
    .limit(1);
  return relation ?? null;
}

export async function getActiveCircleMembership(userId: string, circleId: string) {
  const [membership] = await db
    .select({
      id: circleMembershipPeriods.id,
      relationId: circleMemberRelations.id,
      circleId: circleMemberRelations.circleId,
      userId: circleMemberRelations.userId,
      historyVisibleFrom: circleMemberRelations.historyVisibleFrom,
      activePeriodId: circleMemberRelations.activePeriodId,
      circleNickname: circleMembershipPeriods.circleNickname,
      joinedAt: circleMembershipPeriods.joinedAt,
      lastViewedAt: circleMembershipPeriods.lastViewedAt,
      leftAt: circleMembershipPeriods.leftAt,
    })
    .from(circleMemberRelations)
    .innerJoin(
      circleMembershipPeriods,
      eq(circleMemberRelations.activePeriodId, circleMembershipPeriods.id),
    )
    .innerJoin(
      circles,
      and(
        eq(circleMemberRelations.circleId, circles.id),
        eq(circles.status, "active"),
      ),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, userId),
        eq(circleMemberRelations.circleId, circleId),
        isNotNull(circleMemberRelations.activePeriodId),
        isNull(circleMembershipPeriods.leftAt),
      ),
    )
    .limit(1);
  return membership ?? null;
}

export async function assertActiveCircleMutation(
  transaction: CircleTransaction,
  userId: string,
  circleId: string,
) {
  const [circle] = await transaction
    .select({ id: circles.id })
    .from(circles)
    .where(and(eq(circles.id, circleId), eq(circles.status, "active")))
    .limit(1)
    .for("update");
  if (!circle) throw new Error("这个圈子目前不能修改。");
  const [membership] = await transaction
    .select({ id: circleMemberRelations.id })
    .from(circleMemberRelations)
    .where(
      and(
        eq(circleMemberRelations.circleId, circleId),
        eq(circleMemberRelations.userId, userId),
        isNotNull(circleMemberRelations.activePeriodId),
      ),
    )
    .limit(1);
  if (!membership) throw new Error("只有当前活跃成员可以修改这个圈子。");
}

export async function getCircleDashboard(userId: string) {
  await Promise.all([
    settleExpiredCircleCreationRequests(),
    expireCircleProposals(),
  ]);
  const relationRows = await db
    .select({
      relationId: circleMemberRelations.id,
      circleId: circles.id,
      liveName: circles.name,
      liveDescription: circles.description,
      liveStatus: circles.status,
      liveUpdatedAt: circles.updatedAt,
      frozenAt: circles.frozenAt,
      deleteAt: circles.deleteAt,
      recoverableByUserId: circles.recoverableByUserId,
      activePeriodId: circleMemberRelations.activePeriodId,
      joinedAt: circleMembershipPeriods.joinedAt,
      lastViewedAt: circleMembershipPeriods.lastViewedAt,
      snapshotId: circleExitSnapshots.id,
      snapshotName: circleExitSnapshots.circleName,
      snapshotDescription: circleExitSnapshots.circleDescription,
      snapshotCapturedAt: circleExitSnapshots.capturedAt,
    })
    .from(circleMemberRelations)
    .innerJoin(circles, eq(circleMemberRelations.circleId, circles.id))
    .leftJoin(
      circleMembershipPeriods,
      eq(circleMemberRelations.activePeriodId, circleMembershipPeriods.id),
    )
    .leftJoin(
      circleExitSnapshots,
      eq(circleExitSnapshots.relationId, circleMemberRelations.id),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, userId),
        or(
          isNotNull(circleMemberRelations.activePeriodId),
          isNotNull(circleExitSnapshots.id),
          and(
            eq(circles.status, "frozen"),
            eq(circles.recoverableByUserId, userId),
          ),
        ),
      ),
    )
    .orderBy(
      desc(
        sql`case
          when ${circleMemberRelations.activePeriodId} is not null
            then ${circles.updatedAt}
          else coalesce(
            ${circleExitSnapshots.capturedAt},
            ${circles.frozenAt},
            ${circles.updatedAt}
          )
        end`,
      ),
      asc(circles.id),
    );

  const circleIds = [...new Set(relationRows.map((row) => row.circleId))];
  const activeRows = relationRows.filter((row) => row.activePeriodId !== null);
  const activeCircleIds = activeRows.map((row) => row.circleId);
  const oldestViewedAt = activeRows.length
    ? new Date(
        Math.min(
          ...activeRows.map((row) => (row.lastViewedAt ?? new Date()).getTime()),
        ),
      )
    : null;
  const [unreadPostRows, unreadEventRows] =
    oldestViewedAt && activeCircleIds.length
      ? await Promise.all([
          db
            .select({
              circleId: posts.circleId,
              authorId: posts.authorId,
              createdAt: posts.createdAt,
            })
            .from(posts)
            .where(
              and(
                inArray(posts.circleId, activeCircleIds),
                eq(posts.publicationStatus, "published"),
                sql`${posts.createdAt} > ${oldestViewedAt}`,
              ),
            ),
          db
            .select({
              circleId: circleEvents.circleId,
              actorId: circleEvents.actorId,
              createdAt: circleEvents.createdAt,
            })
            .from(circleEvents)
            .where(
              and(
                inArray(circleEvents.circleId, activeCircleIds),
                sql`${circleEvents.createdAt} > ${oldestViewedAt}`,
              ),
            ),
        ])
      : [[], []];

  const memberPeriodRows = circleIds.length
    ? await db
        .select({
          circleId: circleMemberRelations.circleId,
          activePeriodId: circleMemberRelations.activePeriodId,
          periodId: circleMembershipPeriods.id,
          joinedAt: circleMembershipPeriods.joinedAt,
          leftAt: circleMembershipPeriods.leftAt,
          id: user.id,
          name: user.name,
          realName: user.realName,
          nickname: user.nickname,
          circleNickname: circleMembershipPeriods.circleNickname,
          image: user.image,
        })
        .from(circleMemberRelations)
        .innerJoin(
          circleMembershipPeriods,
          eq(circleMembershipPeriods.relationId, circleMemberRelations.id),
        )
        .innerJoin(user, eq(circleMemberRelations.userId, user.id))
        .where(inArray(circleMemberRelations.circleId, circleIds))
        .orderBy(circleMembershipPeriods.joinedAt)
    : [];

  const summaries = relationRows.map((row) => {
    const isActive = row.activePeriodId !== null;
    const capturedAt = row.snapshotCapturedAt;
    const relevantMembers = memberPeriodRows.filter((member) => {
      if (member.circleId !== row.circleId) return false;
      if (isActive) return member.periodId === member.activePeriodId;
      if (!capturedAt) return false;
      return (
        member.joinedAt <= capturedAt &&
        (!member.leftAt || member.leftAt >= capturedAt)
      );
    });
    const uniqueMembers = new Map<
      string,
      { id: string; name: string; realName: string; image: string | null }
    >();
    for (const member of relevantMembers) {
      uniqueMembers.set(member.id, {
        id: member.id,
        name: member.circleNickname ?? member.nickname ?? member.name,
        realName: member.realName,
        image: member.image,
      });
    }
    const lastViewedAt = row.lastViewedAt;
    const unreadPosts =
      isActive && lastViewedAt
        ? unreadPostRows.filter(
            (post) =>
              post.circleId === row.circleId &&
              post.authorId !== userId &&
              post.createdAt > lastViewedAt,
          ).length
        : 0;
    const unreadChanges =
      isActive && lastViewedAt
        ? unreadEventRows.filter(
            (event) =>
              event.circleId === row.circleId &&
              event.actorId !== userId &&
              event.createdAt > lastViewedAt,
          ).length
        : 0;
    return {
      id: row.circleId,
      name: isActive ? row.liveName : (row.snapshotName ?? row.liveName),
      description: isActive
        ? row.liveDescription
        : (row.snapshotDescription ?? row.liveDescription),
      status: row.liveStatus,
      updatedAt: (
        isActive
          ? row.liveUpdatedAt
          : (row.snapshotCapturedAt ?? row.frozenAt ?? row.liveUpdatedAt)
      ).toISOString(),
      isActive,
      isArchived: !isActive,
      capturedAt: row.snapshotCapturedAt?.toISOString() ?? null,
      frozenAt: row.frozenAt?.toISOString() ?? null,
      deleteAt: row.deleteAt?.toISOString() ?? null,
      canRestore:
        row.liveStatus === "frozen" &&
        row.recoverableByUserId === userId &&
        Boolean(row.deleteAt && row.deleteAt > new Date()),
      members: [...uniqueMembers.values()],
      unread: {
        posts: unreadPosts,
        comments: 0,
        replies: 0,
        changes: unreadChanges,
        total: unreadPosts + unreadChanges,
      },
    };
  });

  const creationRequestRows = await db
    .select({
      id: circleCreationRequests.id,
      name: circleCreationRequests.name,
      description: circleCreationRequests.description,
      status: circleCreationRequests.status,
      expiresAt: circleCreationRequests.expiresAt,
      resolvedAt: circleCreationRequests.resolvedAt,
    })
    .from(circleCreationRequests)
    .where(
      and(
        eq(circleCreationRequests.creatorId, userId),
        inArray(circleCreationRequests.status, ["pending", "failed"]),
      ),
    )
    .orderBy(desc(circleCreationRequests.createdAt));
  const creationRequestIds = creationRequestRows.map((row) => row.id);
  const creationInviteRows = creationRequestIds.length
    ? await db
        .select({
          requestId: circleCreationInvitees.requestId,
          candidateId: user.id,
          candidateName: user.name,
          status: circleCreationInvitees.status,
        })
        .from(circleCreationInvitees)
        .innerJoin(user, eq(circleCreationInvitees.candidateId, user.id))
        .where(inArray(circleCreationInvitees.requestId, creationRequestIds))
        .orderBy(user.name)
    : [];
  const creationRequests = creationRequestRows.map((request) => ({
    ...request,
    status: request.status as "pending" | "failed",
    expiresAt: request.expiresAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    invitees: creationInviteRows
      .filter((invitee) => invitee.requestId === request.id)
      .map((invitee) => ({
        id: invitee.candidateId,
        name: invitee.candidateName,
        status: invitee.status,
      })),
  }));

  const creationActionRows = await db
    .select({
      requestId: circleCreationRequests.id,
      circleName: circleCreationRequests.name,
      expiresAt: circleCreationRequests.expiresAt,
    })
    .from(circleCreationInvitees)
    .innerJoin(
      circleCreationRequests,
      eq(circleCreationInvitees.requestId, circleCreationRequests.id),
    )
    .where(
      and(
        eq(circleCreationInvitees.candidateId, userId),
        eq(circleCreationInvitees.status, "pending"),
        eq(circleCreationRequests.status, "pending"),
      ),
    );
  const candidateRows = await db
    .select({
      proposalId: circleJoinProposals.id,
      circleId: circles.id,
      circleName: circles.name,
      candidateId: circleJoinProposals.candidateId,
      kind: circleJoinProposals.kind,
      allowHistory: circleJoinProposals.allowHistory,
      expiresAt: circleJoinProposals.expiresAt,
    })
    .from(circleJoinProposals)
    .innerJoin(circles, eq(circleJoinProposals.circleId, circles.id))
    .where(
      and(
        eq(circleJoinProposals.candidateId, userId),
        eq(circleJoinProposals.status, "awaiting_candidate"),
        eq(circles.status, "active"),
      ),
    );
  const approvalRows = await db
    .select({
      proposalId: circleJoinProposals.id,
      circleId: circles.id,
      circleName: circles.name,
      candidateId: circleJoinProposals.candidateId,
      kind: circleJoinProposals.kind,
      allowHistory: circleJoinProposals.allowHistory,
      expiresAt: circleJoinProposals.expiresAt,
    })
    .from(circleProposalApprovals)
    .innerJoin(
      circleJoinProposals,
      eq(circleProposalApprovals.proposalId, circleJoinProposals.id),
    )
    .innerJoin(circles, eq(circleJoinProposals.circleId, circles.id))
    .innerJoin(
      circleMemberRelations,
      and(
        eq(circleMemberRelations.circleId, circleJoinProposals.circleId),
        eq(circleMemberRelations.userId, circleProposalApprovals.userId),
        isNotNull(circleMemberRelations.activePeriodId),
      ),
    )
    .where(
      and(
        eq(circleProposalApprovals.userId, userId),
        eq(circleProposalApprovals.decision, "pending"),
        eq(circleJoinProposals.status, "pending_approval"),
        eq(circles.status, "active"),
      ),
    );
  const candidateIds = [...new Set(approvalRows.map((row) => row.candidateId))];
  const candidates = candidateIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, candidateIds))
    : [];
  const candidateNames = new Map(
    candidates.map((candidate) => [candidate.id, candidate.name]),
  );

  return {
    circles: summaries,
    creationRequests,
    actions: [
      ...creationActionRows.map((row) => ({
        actionId: row.requestId,
        actionType: "creation" as const,
        circleName: row.circleName,
        candidateName: "你",
        kind: "creation" as const,
        allowHistory: true,
        expiresAt: row.expiresAt.toISOString(),
        role: "candidate" as const,
      })),
      ...candidateRows.map((row) => ({
        actionId: row.proposalId,
        actionType: "proposal" as const,
        circleId: row.circleId,
        circleName: row.circleName,
        kind: row.kind,
        allowHistory: row.allowHistory,
        candidateName: "你",
        expiresAt: row.expiresAt.toISOString(),
        role: "candidate" as const,
      })),
      ...approvalRows.map((row) => ({
        actionId: row.proposalId,
        actionType: "proposal" as const,
        circleId: row.circleId,
        circleName: row.circleName,
        kind: row.kind,
        allowHistory: row.allowHistory,
        candidateName: candidateNames.get(row.candidateId) ?? "一位朋友",
        expiresAt: row.expiresAt.toISOString(),
        role: "approver" as const,
      })),
    ],
  };
}

export async function getCircleDetail(userId: string, circleId: string) {
  await expireCircleProposals();
  const [viewer] = await db
    .select({
      relationId: circleMemberRelations.id,
      historyVisibleFrom: circleMemberRelations.historyVisibleFrom,
      activePeriodId: circleMemberRelations.activePeriodId,
      liveName: circles.name,
      liveDescription: circles.description,
      liveStatus: circles.status,
      liveCreatedAt: circles.createdAt,
      liveUpdatedAt: circles.updatedAt,
      frozenAt: circles.frozenAt,
      deleteAt: circles.deleteAt,
      recoverableByUserId: circles.recoverableByUserId,
      snapshotId: circleExitSnapshots.id,
      snapshotName: circleExitSnapshots.circleName,
      snapshotDescription: circleExitSnapshots.circleDescription,
      snapshotCapturedAt: circleExitSnapshots.capturedAt,
    })
    .from(circleMemberRelations)
    .innerJoin(circles, eq(circleMemberRelations.circleId, circles.id))
    .leftJoin(
      circleExitSnapshots,
      eq(circleExitSnapshots.relationId, circleMemberRelations.id),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, userId),
        eq(circleMemberRelations.circleId, circleId),
      ),
    )
    .limit(1);
  if (!viewer) return null;

  const isActive = viewer.activePeriodId !== null;
  const isArchived =
    !isActive &&
    (viewer.snapshotId !== null ||
      (viewer.liveStatus === "frozen" &&
        viewer.recoverableByUserId === userId));
  if (!isActive && !isArchived) return null;
  const capturedAt = viewer.snapshotCapturedAt;
  const memberRows = await db
    .select({
      activePeriodId: circleMemberRelations.activePeriodId,
      periodId: circleMembershipPeriods.id,
      id: user.id,
      name: user.name,
      realName: user.realName,
      nickname: user.nickname,
      circleNickname: circleMembershipPeriods.circleNickname,
      image: user.image,
      joinedAt: circleMembershipPeriods.joinedAt,
      leftAt: circleMembershipPeriods.leftAt,
    })
    .from(circleMemberRelations)
    .innerJoin(
      circleMembershipPeriods,
      eq(circleMembershipPeriods.relationId, circleMemberRelations.id),
    )
    .innerJoin(user, eq(circleMemberRelations.userId, user.id))
    .where(eq(circleMemberRelations.circleId, circleId))
    .orderBy(circleMembershipPeriods.joinedAt);

  const memberRowsByUser = new Map<
    string,
    Array<(typeof memberRows)[number]>
  >();
  for (const row of memberRows) {
    const periodWasVisible = isActive
      ? true
      : Boolean(
          capturedAt &&
            row.joinedAt <= capturedAt &&
            (!row.leftAt || row.leftAt >= capturedAt),
        );
    if (!periodWasVisible) continue;
    const rows = memberRowsByUser.get(row.id) ?? [];
    rows.push(row);
    memberRowsByUser.set(row.id, rows);
  }
  const members = [...memberRowsByUser.values()].map((rows) => {
    const periods = rows.toSorted(
      (left, right) =>
        left.joinedAt.getTime() - right.joinedAt.getTime() ||
        left.periodId.localeCompare(right.periodId),
    );
    const profile = periods[0]!;
    const identityPeriod = isArchived
      ? null
      : (periods.find(
          (period) => period.periodId === period.activePeriodId,
        ) ?? null);
    const circleNickname = identityPeriod?.circleNickname ?? null;
    return {
      id: profile.id,
      name: circleNickname ?? profile.nickname ?? profile.name,
      realName: profile.realName,
      nickname: profile.nickname,
      circleNickname,
      image: profile.image,
      isActive: isArchived || identityPeriod !== null,
      periods: periods.map((period) => ({
        id: period.periodId,
        joinedAt: period.joinedAt.toISOString(),
        leftAt: period.leftAt?.toISOString() ?? null,
      })),
    };
  });

  const events = await db
    .select({
      id: circleEvents.id,
      type: circleEvents.type,
      message: circleEvents.message,
      createdAt: circleEvents.createdAt,
    })
    .from(circleEvents)
    .where(
      and(
        eq(circleEvents.circleId, circleId),
        gte(circleEvents.createdAt, viewer.historyVisibleFrom),
        isArchived && capturedAt
          ? lte(circleEvents.createdAt, capturedAt)
          : undefined,
      ),
    )
    .orderBy(desc(circleEvents.createdAt))
    .limit(20);

  return {
    id: circleId,
    name: isArchived
      ? (viewer.snapshotName ?? viewer.liveName)
      : viewer.liveName,
    description: isArchived
      ? (viewer.snapshotDescription ?? viewer.liveDescription)
      : viewer.liveDescription,
    status: viewer.liveStatus,
    createdAt: viewer.liveCreatedAt.toISOString(),
    updatedAt: (
      isArchived
        ? (viewer.snapshotCapturedAt ?? viewer.liveUpdatedAt)
        : viewer.liveUpdatedAt
    ).toISOString(),
    historyVisibleFrom: viewer.historyVisibleFrom.toISOString(),
    isActive,
    isArchived,
    capturedAt: viewer.snapshotCapturedAt?.toISOString() ?? null,
    frozenAt: viewer.frozenAt?.toISOString() ?? null,
    deleteAt: viewer.deleteAt?.toISOString() ?? null,
    canRestore:
      viewer.liveStatus === "frozen" &&
      viewer.recoverableByUserId === userId &&
      Boolean(viewer.deleteAt && viewer.deleteAt > new Date()),
    members,
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function createCircle(
  creatorId: string,
  input: { name: string; description: string; invitedUserIds: string[] },
) {
  const now = new Date();
  const requestId = randomUUID();
  await db.transaction(async (transaction) => {
    await transaction.insert(circleCreationRequests).values({
      id: requestId,
      creatorId,
      name: input.name,
      description: input.description,
      expiresAt: oneDayFrom(now),
      createdAt: now,
    });
    await transaction.insert(circleCreationInvitees).values(
      input.invitedUserIds.map((candidateId) => ({
        requestId,
        candidateId,
      })),
    );
  });
  return requestId;
}

export async function respondToCircleCreationInvite(
  userId: string,
  requestId: string,
  decision: "accept" | "decline",
) {
  let expired = false;
  const circleId = await db.transaction(async (transaction) => {
    const [request] = await transaction
      .select()
      .from(circleCreationRequests)
      .where(eq(circleCreationRequests.id, requestId))
      .limit(1)
      .for("update");
    if (!request || request.status !== "pending") {
      throw new Error("这项创建邀请已经失效或处理完成。");
    }
    const now = new Date();
    if (now >= request.expiresAt) {
      expired = true;
      return settleCircleCreationRequest(transaction, requestId, now);
    }
    const [invitee] = await transaction
      .select({ candidateId: circleCreationInvitees.candidateId })
      .from(circleCreationInvitees)
      .where(
        and(
          eq(circleCreationInvitees.requestId, requestId),
          eq(circleCreationInvitees.candidateId, userId),
          eq(circleCreationInvitees.status, "pending"),
        ),
      )
      .limit(1)
      .for("update");
    if (!invitee) {
      throw new Error("你目前不需要处理这项创建邀请。");
    }
    await transaction
      .update(circleCreationInvitees)
      .set({
        status: decision === "accept" ? "accepted" : "declined",
        resolvedAt: now,
      })
      .where(
        and(
          eq(circleCreationInvitees.requestId, requestId),
          eq(circleCreationInvitees.candidateId, userId),
          eq(circleCreationInvitees.status, "pending"),
        ),
      );
    return settleCircleCreationRequest(transaction, requestId, now);
  });
  if (expired) throw new Error("这项创建邀请已经超过 24 小时。");
  return circleId;
}

export async function acknowledgeCircleCreationResult(
  userId: string,
  requestId: string,
) {
  const deleted = await db
    .delete(circleCreationRequests)
    .where(
      and(
        eq(circleCreationRequests.id, requestId),
        eq(circleCreationRequests.creatorId, userId),
        eq(circleCreationRequests.status, "failed"),
      ),
    )
    .returning({ id: circleCreationRequests.id });
  if (!deleted.length) throw new Error("没有可确认的创建结果。");
}

export async function createCircleJoinProposal(
  proposerId: string,
  input: {
    circleId: string;
    candidateId: string;
    allowHistory: boolean;
    kind?: "add" | "rejoin";
  },
) {
  const proposalId = randomUUID();
  const now = new Date();
  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({ status: circles.status })
      .from(circles)
      .where(eq(circles.id, input.circleId))
      .limit(1)
      .for("update");
    if (!circle || circle.status !== "active") {
      throw new Error("这个圈子目前不能发起加入提案。");
    }

    const activeMemberRows = await transaction
      .select({ userId: circleMemberRelations.userId })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, input.circleId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    const activeMemberIds = activeMemberRows.map((row) => row.userId);
    if (!activeMemberIds.includes(proposerId)) {
      throw new Error("只有活跃成员可以发起加入提案。");
    }
    if (activeMemberIds.includes(input.candidateId)) {
      throw new Error("这位朋友已经在圈子里了。");
    }
    if (activeMemberIds.length >= maximumCircleMembers) {
      throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
    }

    const [existingRelation] = await transaction
      .select({ id: circleMemberRelations.id })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.userId, input.candidateId),
          eq(circleMemberRelations.circleId, input.circleId),
        ),
      )
      .limit(1);
    const proposalKind = existingRelation ? "rejoin" : (input.kind ?? "add");
    const [existingProposal] = await transaction
      .select({ id: circleJoinProposals.id })
      .from(circleJoinProposals)
      .where(
        and(
          eq(circleJoinProposals.circleId, input.circleId),
          eq(circleJoinProposals.candidateId, input.candidateId),
          inArray(circleJoinProposals.status, [...activeProposalStatuses]),
        ),
      )
      .limit(1);
    if (existingProposal) {
      throw new Error("这位朋友已经有一项待处理提案。");
    }

    const status =
      activeMemberIds.length === 1 ? "awaiting_candidate" : "pending_approval";
    await transaction.insert(circleJoinProposals).values({
      id: proposalId,
      circleId: input.circleId,
      candidateId: input.candidateId,
      proposerId,
      kind: proposalKind,
      allowHistory: proposalKind === "rejoin" ? true : input.allowHistory,
      status,
      expiresAt: threeDaysFromNow(),
      createdAt: now,
    });
    if (activeMemberIds.length > 1) {
      await transaction.insert(circleProposalApprovals).values(
        activeMemberIds.map((memberId) => ({
          proposalId,
          userId: memberId,
          decision:
            memberId === proposerId ? ("approved" as const) : ("pending" as const),
          respondedAt: memberId === proposerId ? now : null,
        })),
      );
    }
  });
  return proposalId;
}

export async function requestCircleRejoin(userId: string, circleId: string) {
  const proposalId = randomUUID();
  const now = new Date();
  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({ status: circles.status })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1)
      .for("update");
    const [relation] = await transaction
      .select({
        id: circleMemberRelations.id,
        activePeriodId: circleMemberRelations.activePeriodId,
      })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.userId, userId),
          eq(circleMemberRelations.circleId, circleId),
        ),
      )
      .limit(1)
      .for("update");
    if (!circle || circle.status !== "active" || !relation) {
      throw new Error("这个圈子目前不能申请重新加入。");
    }
    if (relation.activePeriodId) {
      throw new Error("你已经是圈子的活跃成员。");
    }

    const [existingProposal] = await transaction
      .select({ id: circleJoinProposals.id })
      .from(circleJoinProposals)
      .where(
        and(
          eq(circleJoinProposals.circleId, circleId),
          eq(circleJoinProposals.candidateId, userId),
          inArray(circleJoinProposals.status, [...activeProposalStatuses]),
        ),
      )
      .limit(1);
    if (existingProposal) {
      throw new Error("你已经有一项待处理的重新加入申请。");
    }

    const activeMemberRows = await transaction
      .select({ userId: circleMemberRelations.userId })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, circleId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    const activeMemberIds = activeMemberRows.map((row) => row.userId);
    if (activeMemberIds.length === 0) {
      throw new Error("圈子目前没有活跃成员处理申请。");
    }
    if (activeMemberIds.length >= maximumCircleMembers) {
      throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
    }

    await transaction.insert(circleJoinProposals).values({
      id: proposalId,
      circleId,
      candidateId: userId,
      proposerId: userId,
      kind: "rejoin",
      allowHistory: true,
      status: "pending_approval",
      expiresAt: threeDaysFromNow(),
      createdAt: now,
    });
    await transaction.insert(circleProposalApprovals).values(
      activeMemberIds.map((memberId) => ({
        proposalId,
        userId: memberId,
      })),
    );
  });
  return proposalId;
}

export async function respondToCircleProposal(
  userId: string,
  proposalId: string,
  decision: "accept" | "decline",
) {
  await expireCircleProposals();
  const [proposal] = await db
    .select()
    .from(circleJoinProposals)
    .where(eq(circleJoinProposals.id, proposalId))
    .limit(1);
  if (
    !proposal ||
    !activeProposalStatuses.includes(
      proposal.status as (typeof activeProposalStatuses)[number],
    )
  ) {
    throw new Error("这项邀请已经失效或处理完成。");
  }

  if (proposal.candidateId === userId) {
    if (proposal.status !== "awaiting_candidate") {
      throw new Error("你目前还不能确认加入这项提案。");
    }

    let archivedMediaIds: string[] = [];
    let expired = false;
    await db.transaction(async (transaction) => {
      const [circle] = await transaction
        .select({
          id: circles.id,
          status: circles.status,
          createdAt: circles.createdAt,
        })
        .from(circles)
        .where(eq(circles.id, proposal.circleId))
        .limit(1)
        .for("update");
      if (!circle || circle.status !== "active") {
        throw new Error("这个圈子目前不能接受新成员。");
      }

      const [lockedProposal] = await transaction
        .select()
        .from(circleJoinProposals)
        .where(eq(circleJoinProposals.id, proposalId))
        .limit(1)
        .for("update");
      if (
        !lockedProposal ||
        lockedProposal.candidateId !== userId ||
        lockedProposal.status !== "awaiting_candidate"
      ) {
        throw new Error("这项邀请已经失效或处理完成。");
      }

      const now = new Date();
      if (now >= lockedProposal.expiresAt) {
        await transaction
          .update(circleJoinProposals)
          .set({ status: "expired", resolvedAt: now })
          .where(
            and(
              eq(circleJoinProposals.id, proposalId),
              eq(circleJoinProposals.status, "awaiting_candidate"),
            ),
          );
        expired = true;
        return;
      }
      if (decision === "decline") {
        await transaction
          .update(circleJoinProposals)
          .set({ status: "declined", resolvedAt: now })
          .where(
            and(
              eq(circleJoinProposals.id, proposalId),
              eq(circleJoinProposals.status, "awaiting_candidate"),
            ),
          );
        return;
      }

      const activeMemberRows = await transaction
        .select({
          userId: circleMemberRelations.userId,
          activeSlot: circleMemberRelations.activeSlot,
        })
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.circleId, lockedProposal.circleId),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        );
      if (activeMemberRows.length >= maximumCircleMembers) {
        throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
      }
      const activeSlot = firstAvailableSlot(
        activeMemberRows
          .map((member) => member.activeSlot)
          .filter((slot): slot is number => slot !== null),
      );
      if (!activeSlot) {
        throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
      }

      const [existingRelation] = await transaction
        .select()
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.userId, userId),
            eq(circleMemberRelations.circleId, lockedProposal.circleId),
          ),
        )
        .limit(1)
        .for("update");
      if (existingRelation?.activePeriodId) {
        throw new Error("你已经是圈子的活跃成员。");
      }

      const relationId = existingRelation?.id ?? randomUUID();
      const periodId = randomUUID();
      if (existingRelation) {
        const [snapshot] = await transaction
          .select({ id: circleExitSnapshots.id })
          .from(circleExitSnapshots)
          .where(eq(circleExitSnapshots.relationId, relationId))
          .limit(1);
        if (snapshot) {
          const archivedMediaRows = await transaction
            .select({ mediaId: circleExitSnapshotMedia.mediaId })
            .from(circleExitSnapshotMedia)
            .innerJoin(
              circleExitSnapshotPosts,
              eq(
                circleExitSnapshotMedia.snapshotPostId,
                circleExitSnapshotPosts.id,
              ),
            )
            .where(eq(circleExitSnapshotPosts.exitSnapshotId, snapshot.id));
          archivedMediaIds = [
            ...new Set(archivedMediaRows.map((row) => row.mediaId)),
          ];
        }
      }

      if (!existingRelation) {
        await transaction.insert(circleMemberRelations).values({
          id: relationId,
          circleId: lockedProposal.circleId,
          userId,
          historyVisibleFrom: lockedProposal.allowHistory
            ? circle.createdAt
            : now,
          createdAt: now,
        });
      }
      await transaction.insert(circleMembershipPeriods).values({
        id: periodId,
        relationId,
        joinedAt: now,
        lastViewedAt: now,
      });
      await transaction
        .update(circleMemberRelations)
        .set({ activePeriodId: periodId, activeSlot })
        .where(eq(circleMemberRelations.id, relationId));
      await transaction
        .delete(circleExitSnapshots)
        .where(eq(circleExitSnapshots.relationId, relationId));
      await transaction
        .update(circleJoinProposals)
        .set({ status: "accepted", resolvedAt: now })
        .where(
          and(
            eq(circleJoinProposals.id, proposalId),
            eq(circleJoinProposals.status, "awaiting_candidate"),
          ),
        );
      await transaction
        .update(circles)
        .set({ updatedAt: now })
        .where(eq(circles.id, lockedProposal.circleId));
      await transaction.insert(circleEvents).values({
        id: randomUUID(),
        circleId: lockedProposal.circleId,
        actorId: userId,
        type: existingRelation ? "member_rejoined" : "member_joined",
        message: existingRelation
          ? "重新回到了圈子。"
          : "加入了这个小圈子。",
        createdAt: now,
      });
    });
    if (expired) throw new Error("这项邀请已经过期。");
    await Promise.all(
      archivedMediaIds.map((mediaId) => deleteMediaAsset(mediaId)),
    );
    return;
  }

  let expired = false;
  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({ id: circles.id, status: circles.status })
      .from(circles)
      .where(eq(circles.id, proposal.circleId))
      .limit(1)
      .for("update");
    if (!circle || circle.status !== "active") {
      throw new Error("这个圈子目前不能处理加入提案。");
    }

    const [activeApprover] = await transaction
      .select({ id: circleMemberRelations.id })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, proposal.circleId),
          eq(circleMemberRelations.userId, userId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      )
      .limit(1)
      .for("update");
    if (!activeApprover) {
      throw new Error("只有当前活跃成员可以处理这项提案。");
    }

    const [pendingProposal] = await transaction
      .select({
        id: circleJoinProposals.id,
        expiresAt: circleJoinProposals.expiresAt,
      })
      .from(circleJoinProposals)
      .where(
        and(
          eq(circleJoinProposals.id, proposalId),
          eq(circleJoinProposals.status, "pending_approval"),
        ),
      )
      .limit(1)
      .for("update");
    const [approval] = await transaction
      .select({ userId: circleProposalApprovals.userId })
      .from(circleProposalApprovals)
      .where(
        and(
          eq(circleProposalApprovals.proposalId, proposalId),
          eq(circleProposalApprovals.userId, userId),
          eq(circleProposalApprovals.decision, "pending"),
        ),
      )
      .limit(1)
      .for("update");
    if (!pendingProposal || !approval) {
      throw new Error("你目前不需要处理这项提案。");
    }

    const now = new Date();
    if (now >= pendingProposal.expiresAt) {
      await transaction
        .update(circleJoinProposals)
        .set({ status: "expired", resolvedAt: now })
        .where(
          and(
            eq(circleJoinProposals.id, proposalId),
            eq(circleJoinProposals.status, "pending_approval"),
          ),
        );
      expired = true;
      return;
    }
    await transaction
      .update(circleProposalApprovals)
      .set({
        decision: decision === "accept" ? "approved" : "declined",
        respondedAt: now,
      })
      .where(
        and(
          eq(circleProposalApprovals.proposalId, proposalId),
          eq(circleProposalApprovals.userId, userId),
          eq(circleProposalApprovals.decision, "pending"),
        ),
      );
    if (decision === "decline") {
      await transaction
        .update(circleJoinProposals)
        .set({ status: "declined", resolvedAt: now })
        .where(
          and(
            eq(circleJoinProposals.id, proposalId),
            eq(circleJoinProposals.status, "pending_approval"),
          ),
        );
      return;
    }
    const remaining = await transaction
      .select({ userId: circleProposalApprovals.userId })
      .from(circleProposalApprovals)
      .where(
        and(
          eq(circleProposalApprovals.proposalId, proposalId),
          eq(circleProposalApprovals.decision, "pending"),
        ),
      );
    if (remaining.length === 0) {
      await transaction
        .update(circleJoinProposals)
        .set({ status: "awaiting_candidate" })
        .where(
          and(
            eq(circleJoinProposals.id, proposalId),
            eq(circleJoinProposals.status, "pending_approval"),
          ),
        );
    }
  });
  if (expired) throw new Error("这项邀请已经过期。");
}

export async function leaveCircle(userId: string, circleId: string) {
  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({
        name: circles.name,
        description: circles.description,
        status: circles.status,
        createdAt: circles.createdAt,
      })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1)
      .for("update");
    if (!circle || circle.status !== "active") {
      throw new Error("这个圈子目前不能退出活跃关系。");
    }

    const [activeMembership] = await transaction
      .select({
        id: circleMembershipPeriods.id,
        relationId: circleMemberRelations.id,
        historyVisibleFrom: circleMemberRelations.historyVisibleFrom,
      })
      .from(circleMemberRelations)
      .innerJoin(
        circleMembershipPeriods,
        eq(circleMemberRelations.activePeriodId, circleMembershipPeriods.id),
      )
      .where(
        and(
          eq(circleMemberRelations.userId, userId),
          eq(circleMemberRelations.circleId, circleId),
          isNotNull(circleMemberRelations.activePeriodId),
          isNull(circleMembershipPeriods.leftAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!activeMembership) {
      throw new Error("你已经不在这个圈子的活跃关系中了。");
    }

    const visiblePosts = await transaction
      .select({
        id: posts.id,
        authorId: posts.authorId,
        body: posts.body,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        lastEditedById: posts.lastEditedById,
      })
      .from(posts)
      .where(
        and(
          eq(posts.circleId, circleId),
          eq(posts.publicationStatus, "published"),
          sql`${posts.createdAt} >= ${activeMembership.historyVisibleFrom}`,
        ),
      )
      .orderBy(posts.createdAt);
    const capturedAt = new Date();
    const snapshotId = randomUUID();
    const snapshotPosts = visiblePosts.map((post) => ({
      id: randomUUID(),
      exitSnapshotId: snapshotId,
      sourcePostId: post.id,
      authorId: post.authorId,
      body: post.body,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      lastEditedById: post.lastEditedById,
      capturedAt,
    }));
    const snapshotPostIdBySourceId = new Map(
      visiblePosts.map((post, index) => [post.id, snapshotPosts[index]!.id]),
    );
    const sourcePostIds = visiblePosts.map((post) => post.id);
    const mediaRows = sourcePostIds.length
      ? await transaction
          .select({
            postId: postMedia.postId,
            mediaId: postMedia.mediaId,
            position: postMedia.position,
          })
          .from(postMedia)
          .where(inArray(postMedia.postId, sourcePostIds))
      : [];
    const pendingApprovalRows = await transaction
      .select({ proposalId: circleProposalApprovals.proposalId })
      .from(circleProposalApprovals)
      .innerJoin(
        circleJoinProposals,
        eq(circleProposalApprovals.proposalId, circleJoinProposals.id),
      )
      .where(
        and(
          eq(circleProposalApprovals.userId, userId),
          eq(circleProposalApprovals.decision, "pending"),
          eq(circleJoinProposals.circleId, circleId),
          eq(circleJoinProposals.status, "pending_approval"),
        ),
      )
      .for("update");
    const affectedProposalIds = [
      ...new Set(pendingApprovalRows.map((row) => row.proposalId)),
    ];

    await transaction
      .delete(circleExitSnapshots)
      .where(eq(circleExitSnapshots.relationId, activeMembership.relationId));
    await transaction.insert(circleExitSnapshots).values({
      id: snapshotId,
      relationId: activeMembership.relationId,
      circleName: circle.name,
      circleDescription: circle.description,
      capturedAt,
    });
    if (snapshotPosts.length) {
      await transaction.insert(circleExitSnapshotPosts).values(snapshotPosts);
    }
    if (mediaRows.length) {
      await transaction.insert(circleExitSnapshotMedia).values(
        mediaRows.map((media) => ({
          snapshotPostId: snapshotPostIdBySourceId.get(media.postId)!,
          mediaId: media.mediaId,
          position: media.position,
        })),
      );
    }
    await transaction
      .update(circleMembershipPeriods)
      .set({ leftAt: capturedAt })
      .where(eq(circleMembershipPeriods.id, activeMembership.id));
    await transaction
      .update(circleMemberRelations)
      .set({ activePeriodId: null, activeSlot: null })
      .where(eq(circleMemberRelations.id, activeMembership.relationId));
    const remainingActiveMembers = await transaction
      .select({ id: circleMemberRelations.id })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, circleId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    const isLastActiveMember = remainingActiveMembers.length === 0;
    if (isLastActiveMember) {
      const activeProposalRows = await transaction
        .select({ id: circleJoinProposals.id })
        .from(circleJoinProposals)
        .where(
          and(
            eq(circleJoinProposals.circleId, circleId),
            inArray(circleJoinProposals.status, [...activeProposalStatuses]),
          ),
        )
        .for("update");
      const activeProposalIds = activeProposalRows.map((proposal) => proposal.id);
      if (activeProposalIds.length) {
        await transaction
          .update(circleJoinProposals)
          .set({ status: "invalidated", resolvedAt: capturedAt })
          .where(inArray(circleJoinProposals.id, activeProposalIds));
        await transaction
          .delete(circleProposalApprovals)
          .where(inArray(circleProposalApprovals.proposalId, activeProposalIds));
      }
      await transaction
        .update(circles)
        .set({
          status: "frozen",
          frozenAt: capturedAt,
          deleteAt: getCircleDeleteAt(circle.createdAt, capturedAt),
          recoverableByUserId: userId,
          updatedAt: capturedAt,
        })
        .where(eq(circles.id, circleId));
    } else if (affectedProposalIds.length) {
      await transaction
        .delete(circleProposalApprovals)
        .where(
          and(
            eq(circleProposalApprovals.userId, userId),
            eq(circleProposalApprovals.decision, "pending"),
            inArray(circleProposalApprovals.proposalId, affectedProposalIds),
          ),
        );
      const remainingApprovalRows = await transaction
        .select({ proposalId: circleProposalApprovals.proposalId })
        .from(circleProposalApprovals)
        .where(
          and(
            inArray(circleProposalApprovals.proposalId, affectedProposalIds),
            eq(circleProposalApprovals.decision, "pending"),
          ),
        );
      const proposalsStillPending = new Set(
        remainingApprovalRows.map((row) => row.proposalId),
      );
      const approvedProposalIds = affectedProposalIds.filter(
        (proposalId) => !proposalsStillPending.has(proposalId),
      );
      if (approvedProposalIds.length) {
        await transaction
          .update(circleJoinProposals)
          .set({ status: "awaiting_candidate" })
          .where(
            and(
              inArray(circleJoinProposals.id, approvedProposalIds),
              eq(circleJoinProposals.status, "pending_approval"),
            ),
          );
      }
    }
    if (!isLastActiveMember) {
      await transaction
        .update(circles)
        .set({ updatedAt: capturedAt })
        .where(eq(circles.id, circleId));
    }
    await transaction.insert(circleEvents).values({
      id: randomUUID(),
      circleId,
      actorId: userId,
      type: "member_left",
      message: isLastActiveMember
        ? "作为最后一位活跃成员退出，圈子已冻结并进入删除倒计时。"
        : "退出了圈子的活跃关系，过去的共同记录已保存为历史档案。",
      createdAt: capturedAt,
    });
  });
}

export async function restoreFrozenCircle(userId: string, circleId: string) {
  let archivedMediaIds: string[] = [];
  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({
        status: circles.status,
        deleteAt: circles.deleteAt,
        recoverableByUserId: circles.recoverableByUserId,
      })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1)
      .for("update");
    const now = new Date();
    if (
      !circle ||
      circle.status !== "frozen" ||
      circle.recoverableByUserId !== userId ||
      !circle.deleteAt ||
      now >= circle.deleteAt
    ) {
      throw new Error("这个圈子目前不能恢复。");
    }
    const [relation] = await transaction
      .select({
        id: circleMemberRelations.id,
        activePeriodId: circleMemberRelations.activePeriodId,
      })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, circleId),
          eq(circleMemberRelations.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!relation || relation.activePeriodId) {
      throw new Error("恢复关系状态不正确。");
    }
    const activeMembers = await transaction
      .select({ id: circleMemberRelations.id })
      .from(circleMemberRelations)
      .where(
        and(
          eq(circleMemberRelations.circleId, circleId),
          isNotNull(circleMemberRelations.activePeriodId),
        ),
      );
    if (activeMembers.length) throw new Error("这个圈子已经恢复。");

    const [snapshot] = await transaction
      .select({ id: circleExitSnapshots.id })
      .from(circleExitSnapshots)
      .where(eq(circleExitSnapshots.relationId, relation.id))
      .limit(1);
    if (snapshot) {
      const mediaRows = await transaction
        .select({ mediaId: circleExitSnapshotMedia.mediaId })
        .from(circleExitSnapshotMedia)
        .innerJoin(
          circleExitSnapshotPosts,
          eq(circleExitSnapshotMedia.snapshotPostId, circleExitSnapshotPosts.id),
        )
        .where(eq(circleExitSnapshotPosts.exitSnapshotId, snapshot.id));
      archivedMediaIds = [...new Set(mediaRows.map((row) => row.mediaId))];
    }

    const periodId = randomUUID();
    await transaction.insert(circleMembershipPeriods).values({
      id: periodId,
      relationId: relation.id,
      joinedAt: now,
      lastViewedAt: now,
    });
    await transaction
      .update(circleMemberRelations)
      .set({ activePeriodId: periodId, activeSlot: 1 })
      .where(eq(circleMemberRelations.id, relation.id));
    await transaction
      .delete(circleExitSnapshots)
      .where(eq(circleExitSnapshots.relationId, relation.id));
    await transaction
      .update(circles)
      .set({
        status: "active",
        frozenAt: null,
        deleteAt: null,
        recoverableByUserId: null,
        updatedAt: now,
      })
      .where(eq(circles.id, circleId));
    await transaction.insert(circleEvents).values({
      id: randomUUID(),
      circleId,
      actorId: userId,
      type: "circle_restored",
      message: "恢复了这个小圈子，历史记录停止删除倒计时。",
      createdAt: now,
    });
  });
  await Promise.all(
    archivedMediaIds.map((mediaId) => deleteMediaAsset(mediaId)),
  );
}

async function deleteExpiredFrozenCircles(now: Date) {
  const candidates = await db
    .select({ id: circles.id })
    .from(circles)
    .where(and(eq(circles.status, "frozen"), lte(circles.deleteAt, now)))
    .limit(100);
  let deleted = 0;
  for (const candidate of candidates) {
    const mediaIds = await db.transaction(async (transaction) => {
      const [circle] = await transaction
        .select({
          status: circles.status,
          deleteAt: circles.deleteAt,
        })
        .from(circles)
        .where(eq(circles.id, candidate.id))
        .limit(1)
        .for("update");
      if (
        !circle ||
        circle.status !== "frozen" ||
        !circle.deleteAt ||
        circle.deleteAt > now
      ) {
        return [];
      }
      const activeMembers = await transaction
        .select({ id: circleMemberRelations.id })
        .from(circleMemberRelations)
        .where(
          and(
            eq(circleMemberRelations.circleId, candidate.id),
            isNotNull(circleMemberRelations.activePeriodId),
          ),
        );
      if (activeMembers.length) return [];

      const [postMediaRows, draftMediaRows, archiveMediaRows] =
        await Promise.all([
          transaction
            .select({ mediaId: postMedia.mediaId })
            .from(postMedia)
            .innerJoin(posts, eq(postMedia.postId, posts.id))
            .where(eq(posts.circleId, candidate.id)),
          transaction
            .select({ mediaId: draftMedia.mediaId })
            .from(draftMedia)
            .innerJoin(drafts, eq(draftMedia.draftId, drafts.id))
            .where(eq(drafts.circleId, candidate.id)),
          transaction
            .select({ mediaId: circleExitSnapshotMedia.mediaId })
            .from(circleExitSnapshotMedia)
            .innerJoin(
              circleExitSnapshotPosts,
              eq(
                circleExitSnapshotMedia.snapshotPostId,
                circleExitSnapshotPosts.id,
              ),
            )
            .innerJoin(
              circleExitSnapshots,
              eq(
                circleExitSnapshotPosts.exitSnapshotId,
                circleExitSnapshots.id,
              ),
            )
            .innerJoin(
              circleMemberRelations,
              eq(circleExitSnapshots.relationId, circleMemberRelations.id),
            )
            .where(eq(circleMemberRelations.circleId, candidate.id)),
        ]);
      const collectedMediaIds = [
        ...new Set(
          [...postMediaRows, ...draftMediaRows, ...archiveMediaRows].map(
            (row) => row.mediaId,
          ),
        ),
      ];
      await transaction.delete(drafts).where(eq(drafts.circleId, candidate.id));
      await transaction.delete(posts).where(eq(posts.circleId, candidate.id));
      await transaction.delete(circles).where(eq(circles.id, candidate.id));
      if (collectedMediaIds.length) {
        await transaction
          .update(mediaAssets)
          .set({ status: "deleting", updatedAt: now })
          .where(
            and(
              inArray(mediaAssets.id, collectedMediaIds),
              notExists(
                transaction
                  .select({ id: postMedia.mediaId })
                  .from(postMedia)
                  .where(eq(postMedia.mediaId, mediaAssets.id)),
              ),
              notExists(
                transaction
                  .select({ id: draftMedia.mediaId })
                  .from(draftMedia)
                  .where(eq(draftMedia.mediaId, mediaAssets.id)),
              ),
              notExists(
                transaction
                  .select({ id: circleExitSnapshotMedia.mediaId })
                  .from(circleExitSnapshotMedia)
                  .where(eq(circleExitSnapshotMedia.mediaId, mediaAssets.id)),
              ),
            ),
          );
      }
      deleted += 1;
      return collectedMediaIds;
    });
    await Promise.all(mediaIds.map((mediaId) => deleteMediaAsset(mediaId)));
  }
  return deleted;
}

export async function maintainCircles(now = new Date()) {
  const settledCreationRequests =
    await settleExpiredCircleCreationRequests(now);
  await expireCircleProposals(now);
  const deletedCircles = await deleteExpiredFrozenCircles(now);
  const deletingMedia = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.status, "deleting"))
    .limit(100);
  await Promise.all(
    deletingMedia.map((media) => deleteMediaAsset(media.id)),
  );
  return {
    settledCreationRequests,
    deletedCircles,
    retriedMedia: deletingMedia.length,
  };
}

export async function deleteCircleExitArchive(userId: string, circleId: string) {
  const [relation] = await db
    .select({
      id: circleMemberRelations.id,
      activePeriodId: circleMemberRelations.activePeriodId,
      snapshotId: circleExitSnapshots.id,
    })
    .from(circleMemberRelations)
    .leftJoin(
      circleExitSnapshots,
      eq(circleExitSnapshots.relationId, circleMemberRelations.id),
    )
    .where(
      and(
        eq(circleMemberRelations.userId, userId),
        eq(circleMemberRelations.circleId, circleId),
      ),
    )
    .limit(1);
  if (!relation?.snapshotId) {
    throw new Error("没有可删除的历史圈子档案。");
  }
  if (relation.activePeriodId) {
    throw new Error("重新加入后，旧的退出档案已经不再保留。");
  }
  const archivedMediaIds = await getExitArchiveMediaIds(relation.snapshotId);
  await db
    .delete(circleExitSnapshots)
    .where(eq(circleExitSnapshots.id, relation.snapshotId));
  await Promise.all(
    archivedMediaIds.map((mediaId) => deleteMediaAsset(mediaId)),
  );
}
