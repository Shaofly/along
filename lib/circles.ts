import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  circleEvents,
  circleExitSnapshotMedia,
  circleExitSnapshotPosts,
  circleExitSnapshots,
  circleJoinProposals,
  circleMemberRelations,
  circleMembershipPeriods,
  circleProposalApprovals,
  circles,
  postMedia,
  posts,
  user,
} from "@/db/schema";
import { deleteMediaAsset } from "@/lib/media/service";

const activeProposalStatuses = ["pending_approval", "awaiting_candidate"] as const;
const maximumCircleMembers = 10;

function threeDaysFromNow() {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
}

async function getActiveCircleMemberIds(circleId: string) {
  const rows = await db
    .select({ userId: circleMemberRelations.userId })
    .from(circleMemberRelations)
    .where(
      and(
        eq(circleMemberRelations.circleId, circleId),
        isNotNull(circleMemberRelations.activePeriodId),
      ),
    );
  return rows.map((row) => row.userId);
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

export async function expireCircleProposals() {
  await db
    .update(circleJoinProposals)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        inArray(circleJoinProposals.status, [...activeProposalStatuses]),
        lt(circleJoinProposals.expiresAt, new Date()),
      ),
    );
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

export async function getCircleDashboard(userId: string) {
  await expireCircleProposals();
  const relationRows = await db
    .select({
      relationId: circleMemberRelations.id,
      circleId: circles.id,
      liveName: circles.name,
      liveDescription: circles.description,
      liveStatus: circles.status,
      liveUpdatedAt: circles.updatedAt,
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
        ),
      ),
    )
    .orderBy(desc(circles.updatedAt));

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
          : (row.snapshotCapturedAt ?? row.liveUpdatedAt)
      ).toISOString(),
      isActive,
      isArchived: !isActive,
      capturedAt: row.snapshotCapturedAt?.toISOString() ?? null,
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
    .where(
      and(
        eq(circleProposalApprovals.userId, userId),
        eq(circleProposalApprovals.decision, "pending"),
        eq(circleJoinProposals.status, "pending_approval"),
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
    actions: [
      ...candidateRows.map((row) => ({
        ...row,
        candidateName: "你",
        expiresAt: row.expiresAt.toISOString(),
        role: "candidate" as const,
      })),
      ...approvalRows.map((row) => ({
        ...row,
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
  const isArchived = !isActive && viewer.snapshotId !== null;
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

  const members = new Map<
    string,
    {
      id: string;
      name: string;
      realName: string;
      nickname: string | null;
      circleNickname: string | null;
      image: string | null;
      isActive: boolean;
      periods: Array<{ id: string; joinedAt: string; leftAt: string | null }>;
    }
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
    const member = members.get(row.id) ?? {
      id: row.id,
      name: row.circleNickname ?? row.nickname ?? row.name,
      realName: row.realName,
      nickname: row.nickname,
      circleNickname: row.circleNickname,
      image: row.image,
      isActive: isArchived || row.activePeriodId === row.periodId,
      periods: [],
    };
    member.isActive ||= isArchived || row.activePeriodId === row.periodId;
    member.periods.push({
      id: row.periodId,
      joinedAt: row.joinedAt.toISOString(),
      leftAt: row.leftAt?.toISOString() ?? null,
    });
    members.set(row.id, member);
  }

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
    members: [...members.values()],
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
  const circleId = randomUUID();
  const relationId = randomUUID();
  const periodId = randomUUID();
  await db.transaction(async (transaction) => {
    await transaction.insert(circles).values({
      id: circleId,
      name: input.name,
      description: input.description,
      createdById: creatorId,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(circleMemberRelations).values({
      id: relationId,
      circleId,
      userId: creatorId,
      historyVisibleFrom: now,
      createdAt: now,
    });
    await transaction.insert(circleMembershipPeriods).values({
      id: periodId,
      relationId,
      joinedAt: now,
      lastViewedAt: now,
    });
    await transaction
      .update(circleMemberRelations)
      .set({ activePeriodId: periodId })
      .where(eq(circleMemberRelations.id, relationId));
    await transaction.insert(circleEvents).values({
      id: randomUUID(),
      circleId,
      actorId: creatorId,
      type: "circle_created",
      message: "创建了这个小圈子，正在等朋友们加入。",
      createdAt: now,
    });
    await transaction.insert(circleJoinProposals).values(
      input.invitedUserIds.map((candidateId) => ({
        id: randomUUID(),
        circleId,
        candidateId,
        proposerId: creatorId,
        kind: "initial" as const,
        allowHistory: true,
        status: "awaiting_candidate" as const,
        expiresAt: threeDaysFromNow(),
        createdAt: now,
      })),
    );
  });
  return circleId;
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
  const activeMemberIds = await getActiveCircleMemberIds(input.circleId);
  if (!activeMemberIds.includes(proposerId)) {
    throw new Error("只有活跃成员可以发起加入提案。");
  }
  if (activeMemberIds.includes(input.candidateId)) {
    throw new Error("这位朋友已经在圈子里了。");
  }
  if (activeMemberIds.length >= maximumCircleMembers) {
    throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
  }
  const existingRelation = await getCircleRelation(
    input.candidateId,
    input.circleId,
  );
  const proposalKind = existingRelation ? "rejoin" : (input.kind ?? "add");
  const existingProposal = await db
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
  if (existingProposal.length) {
    throw new Error("这位朋友已经有一项待处理提案。");
  }

  const proposalId = randomUUID();
  const now = new Date();
  const status =
    activeMemberIds.length === 1 ? "awaiting_candidate" : "pending_approval";
  await db.transaction(async (transaction) => {
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
  const [circle] = await db
    .select({ status: circles.status })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);
  const relation = await getCircleRelation(userId, circleId);
  if (!circle || circle.status !== "active" || !relation) {
    throw new Error("这个圈子目前不能申请重新加入。");
  }
  if (relation.activePeriodId) {
    throw new Error("你已经是圈子的活跃成员。");
  }
  const existingProposal = await db
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
  if (existingProposal.length) {
    throw new Error("你已经有一项待处理的重新加入申请。");
  }

  const activeMemberIds = await getActiveCircleMemberIds(circleId);
  if (activeMemberIds.length === 0) {
    throw new Error("圈子目前没有活跃成员处理申请。");
  }
  if (activeMemberIds.length >= maximumCircleMembers) {
    throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
  }
  const proposalId = randomUUID();
  const now = new Date();
  await db.transaction(async (transaction) => {
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

  if (
    proposal.candidateId === userId &&
    proposal.status === "awaiting_candidate"
  ) {
    if (decision === "decline") {
      await db
        .update(circleJoinProposals)
        .set({ status: "declined", resolvedAt: new Date() })
        .where(eq(circleJoinProposals.id, proposalId));
      return;
    }

    const activeMemberIds = await getActiveCircleMemberIds(proposal.circleId);
    if (activeMemberIds.length >= maximumCircleMembers) {
      throw new Error(`每个圈子最多 ${maximumCircleMembers} 位活跃成员。`);
    }
    if (proposal.kind !== "initial") {
      const approvals = await db
        .select({
          userId: circleProposalApprovals.userId,
          decision: circleProposalApprovals.decision,
        })
        .from(circleProposalApprovals)
        .where(eq(circleProposalApprovals.proposalId, proposalId));
      const approvedIds = new Set(
        approvals
          .filter((approval) => approval.decision === "approved")
          .map((approval) => approval.userId),
      );
      const missingIds = activeMemberIds.filter(
        (memberId) => !approvedIds.has(memberId),
      );
      if (missingIds.length > 0) {
        await db.transaction(async (transaction) => {
          await transaction
            .insert(circleProposalApprovals)
            .values(
              missingIds.map((memberId) => ({
                proposalId,
                userId: memberId,
              })),
            )
            .onConflictDoNothing();
          await transaction
            .update(circleJoinProposals)
            .set({ status: "pending_approval" })
            .where(eq(circleJoinProposals.id, proposalId));
        });
        throw new Error("圈子成员发生了变化，需要补齐新的成员确认。");
      }
    }

    const [circle] = await db
      .select({ createdAt: circles.createdAt })
      .from(circles)
      .where(eq(circles.id, proposal.circleId))
      .limit(1);
    if (!circle) throw new Error("这个圈子不存在。");
    const existingRelation = await getCircleRelation(userId, proposal.circleId);
    if (existingRelation?.activePeriodId) {
      throw new Error("你已经是圈子的活跃成员。");
    }
    const now = new Date();
    const relationId = existingRelation?.id ?? randomUUID();
    const periodId = randomUUID();
    const archivedMediaIds = existingRelation
      ? await db
          .select({ snapshotId: circleExitSnapshots.id })
          .from(circleExitSnapshots)
          .where(eq(circleExitSnapshots.relationId, relationId))
          .limit(1)
          .then((rows) =>
            rows[0]?.snapshotId
              ? getExitArchiveMediaIds(rows[0].snapshotId)
              : [],
          )
      : [];
    await db.transaction(async (transaction) => {
      if (!existingRelation) {
        await transaction.insert(circleMemberRelations).values({
          id: relationId,
          circleId: proposal.circleId,
          userId,
          historyVisibleFrom: proposal.allowHistory ? circle.createdAt : now,
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
        .set({ activePeriodId: periodId })
        .where(eq(circleMemberRelations.id, relationId));
      await transaction
        .delete(circleExitSnapshots)
        .where(eq(circleExitSnapshots.relationId, relationId));
      await transaction
        .update(circleJoinProposals)
        .set({ status: "accepted", resolvedAt: now })
        .where(eq(circleJoinProposals.id, proposalId));
      await transaction
        .update(circles)
        .set({ status: "active", updatedAt: now })
        .where(eq(circles.id, proposal.circleId));
      await transaction.insert(circleEvents).values({
        id: randomUUID(),
        circleId: proposal.circleId,
        actorId: userId,
        type: existingRelation ? "member_rejoined" : "member_joined",
        message: existingRelation
          ? "重新回到了圈子。"
          : "加入了这个小圈子。",
        createdAt: now,
      });
    });
    await Promise.all(
      archivedMediaIds.map((mediaId) => deleteMediaAsset(mediaId)),
    );
    return;
  }

  const [approval] = await db
    .select()
    .from(circleProposalApprovals)
    .where(
      and(
        eq(circleProposalApprovals.proposalId, proposalId),
        eq(circleProposalApprovals.userId, userId),
        eq(circleProposalApprovals.decision, "pending"),
      ),
    )
    .limit(1);
  if (!approval || proposal.status !== "pending_approval") {
    throw new Error("你目前不需要处理这项提案。");
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
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
        ),
      );
    if (decision === "decline") {
      await transaction
        .update(circleJoinProposals)
        .set({ status: "declined", resolvedAt: now })
        .where(eq(circleJoinProposals.id, proposalId));
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
        .where(eq(circleJoinProposals.id, proposalId));
    }
  });
}

export async function leaveCircle(userId: string, circleId: string) {
  const activeMembership = await getActiveCircleMembership(userId, circleId);
  if (!activeMembership) {
    throw new Error("你已经不在这个圈子的活跃关系中了。");
  }

  await db.transaction(async (transaction) => {
    const [circle] = await transaction
      .select({
        name: circles.name,
        description: circles.description,
      })
      .from(circles)
      .where(eq(circles.id, circleId))
      .limit(1);
    if (!circle) throw new Error("这个圈子不存在。");

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
      .set({ activePeriodId: null })
      .where(eq(circleMemberRelations.id, activeMembership.relationId));
    await transaction
      .update(circles)
      .set({ updatedAt: capturedAt })
      .where(eq(circles.id, circleId));
    await transaction.insert(circleEvents).values({
      id: randomUUID(),
      circleId,
      actorId: userId,
      type: "member_left",
      message: "退出了圈子的活跃关系，过去的共同记录已保存为历史档案。",
      createdAt: capturedAt,
    });
  });
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
