import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  circleEvents,
  circleJoinProposals,
  circleMembershipPeriods,
  circlePostSnapshots,
  circleProposalApprovals,
  circles,
  posts,
  user,
} from "@/db/schema";

const activeProposalStatuses = ["pending_approval", "awaiting_candidate"] as const;

function threeDaysFromNow() {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
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

export async function getActiveCircleMembership(userId: string, circleId: string) {
  const [membership] = await db
    .select()
    .from(circleMembershipPeriods)
    .where(
      and(
        eq(circleMembershipPeriods.userId, userId),
        eq(circleMembershipPeriods.circleId, circleId),
        isNull(circleMembershipPeriods.leftAt),
      ),
    )
    .limit(1);
  return membership ?? null;
}

export async function getCirclePeriods(userId: string, circleId?: string) {
  return db
    .select()
    .from(circleMembershipPeriods)
    .where(
      circleId
        ? and(
            eq(circleMembershipPeriods.userId, userId),
            eq(circleMembershipPeriods.circleId, circleId),
          )
        : eq(circleMembershipPeriods.userId, userId),
    );
}

export function periodCanSeeCreatedAt(
  period: { visibleFrom: Date | null; joinedAt: Date; leftAt: Date | null },
  createdAt: Date,
) {
  const startsAt = period.visibleFrom ?? new Date(0);
  return createdAt >= startsAt && (!period.leftAt || createdAt <= period.leftAt);
}

export async function getCircleDashboard(userId: string) {
  await expireCircleProposals();
  const periodRows = await db
    .select({
      circleId: circles.id,
      name: circles.name,
      description: circles.description,
      status: circles.status,
      updatedAt: circles.updatedAt,
      joinedAt: circleMembershipPeriods.joinedAt,
      lastViewedAt: circleMembershipPeriods.lastViewedAt,
      leftAt: circleMembershipPeriods.leftAt,
    })
    .from(circleMembershipPeriods)
    .innerJoin(circles, eq(circleMembershipPeriods.circleId, circles.id))
    .where(eq(circleMembershipPeriods.userId, userId))
    .orderBy(desc(circles.updatedAt));

  const circleIds = [...new Set(periodRows.map((row) => row.circleId))];
  const activePeriods = periodRows.filter((row) => row.leftAt === null);
  const activeCircleIds = activePeriods.map((row) => row.circleId);
  const oldestViewedAt = activePeriods.length
    ? new Date(Math.min(...activePeriods.map((row) => row.lastViewedAt.getTime())))
    : null;
  const [unreadPostRows, unreadEventRows] = oldestViewedAt && activeCircleIds.length
    ? await Promise.all([
        db
          .select({ circleId: posts.circleId, authorId: posts.authorId, createdAt: posts.createdAt })
          .from(posts)
          .where(
            and(
              inArray(posts.circleId, activeCircleIds),
              sql`${posts.createdAt} > ${oldestViewedAt}`,
            ),
          ),
        db
          .select({ circleId: circleEvents.circleId, actorId: circleEvents.actorId, createdAt: circleEvents.createdAt })
          .from(circleEvents)
          .where(
            and(
              inArray(circleEvents.circleId, activeCircleIds),
              sql`${circleEvents.createdAt} > ${oldestViewedAt}`,
            ),
          ),
      ])
    : [[], []];
  const activePeriodByCircle = new Map(activePeriods.map((row) => [row.circleId, row]));
  const memberRows = circleIds.length
    ? await db
        .select({
          circleId: circleMembershipPeriods.circleId,
          id: user.id,
          name: user.name,
          realName: user.realName,
          nickname: user.nickname,
          circleNickname: circleMembershipPeriods.circleNickname,
          image: user.image,
        })
        .from(circleMembershipPeriods)
        .innerJoin(user, eq(circleMembershipPeriods.userId, user.id))
        .where(
          and(
            inArray(circleMembershipPeriods.circleId, circleIds),
            isNull(circleMembershipPeriods.leftAt),
          ),
        )
    : [];

  const summaries = new Map<string, {
    id: string;
    name: string;
    description: string;
    status: "forming" | "active" | "dissolved";
    updatedAt: string;
    isActive: boolean;
    members: Array<{ id: string; name: string; realName: string; image: string | null }>;
    unread: { posts: number; comments: number; replies: number; changes: number; total: number };
  }>();
  for (const row of periodRows) {
    const existing = summaries.get(row.circleId);
    if (existing) {
      existing.isActive ||= row.leftAt === null;
      continue;
    }
    summaries.set(row.circleId, {
      id: row.circleId,
      name: row.name,
      description: row.description,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      isActive: row.leftAt === null,
      members: memberRows
        .filter((member) => member.circleId === row.circleId)
        .map(({ id, name, realName, nickname, circleNickname, image }) => ({
          id,
          name: circleNickname ?? nickname ?? name,
          realName,
          image,
        })),
      unread: { posts: 0, comments: 0, replies: 0, changes: 0, total: 0 },
    });
  }

  for (const summary of summaries.values()) {
    const activePeriod = activePeriodByCircle.get(summary.id);
    if (!activePeriod) continue;
    const unreadPosts = unreadPostRows.filter((row) =>
      row.circleId === summary.id &&
      row.authorId !== userId &&
      row.createdAt > activePeriod.lastViewedAt
    ).length;
    const unreadChanges = unreadEventRows.filter((row) =>
      row.circleId === summary.id &&
      row.actorId !== userId &&
      row.createdAt > activePeriod.lastViewedAt
    ).length;
    summary.unread = {
      posts: unreadPosts,
      comments: 0,
      replies: 0,
      changes: unreadChanges,
      total: unreadPosts + unreadChanges,
    };
  }

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
  const candidateNames = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));

  return {
    circles: [...summaries.values()],
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
  const [circle] = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);
  if (!circle) return null;

  const viewerPeriods = await getCirclePeriods(userId, circleId);
  if (viewerPeriods.length === 0) return null;
  const isActive = viewerPeriods.some((period) => period.leftAt === null);

  const memberRows = await db
    .select({
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
    .from(circleMembershipPeriods)
    .innerJoin(user, eq(circleMembershipPeriods.userId, user.id))
    .where(eq(circleMembershipPeriods.circleId, circleId))
    .orderBy(circleMembershipPeriods.joinedAt);

  const members = new Map<string, {
    id: string;
    name: string;
    realName: string;
    nickname: string | null;
    circleNickname: string | null;
    image: string | null;
    isActive: boolean;
    periods: Array<{ id: string; joinedAt: string; leftAt: string | null }>;
  }>();
  for (const row of memberRows) {
    const member = members.get(row.id) ?? {
      id: row.id,
      name: row.name,
      realName: row.realName,
      nickname: row.nickname,
      circleNickname: row.circleNickname,
      image: row.image,
      isActive: false,
      periods: [],
    };
    member.isActive ||= row.leftAt === null;
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
    .where(eq(circleEvents.circleId, circleId))
    .orderBy(desc(circleEvents.createdAt))
    .limit(20);

  return {
    id: circle.id,
    name: circle.name,
    description: circle.description,
    status: circle.status,
    createdAt: circle.createdAt.toISOString(),
    updatedAt: circle.updatedAt.toISOString(),
    isActive,
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
  await db.transaction(async (transaction) => {
    await transaction.insert(circles).values({
      id: circleId,
      name: input.name,
      description: input.description,
      createdById: creatorId,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(circleMembershipPeriods).values({
      id: randomUUID(),
      circleId,
      userId: creatorId,
      visibleFrom: now,
      joinedAt: now,
      lastViewedAt: now,
    });
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
  input: { circleId: string; candidateId: string; allowHistory: boolean; kind?: "add" | "rejoin" },
) {
  const activeMembers = await db
    .select({ userId: circleMembershipPeriods.userId })
    .from(circleMembershipPeriods)
    .where(
      and(
        eq(circleMembershipPeriods.circleId, input.circleId),
        isNull(circleMembershipPeriods.leftAt),
      ),
    );
  if (!activeMembers.some((member) => member.userId === proposerId)) {
    throw new Error("只有活跃成员可以发起加入提案。");
  }
  if (activeMembers.some((member) => member.userId === input.candidateId)) {
    throw new Error("这位朋友已经在圈子里了。");
  }

  const existing = await db
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
  if (existing.length) throw new Error("这位朋友已经有一项待处理提案。");

  const proposalId = randomUUID();
  const now = new Date();
  const status = activeMembers.length === 1 ? "awaiting_candidate" : "pending_approval";
  await db.transaction(async (transaction) => {
    await transaction.insert(circleJoinProposals).values({
      id: proposalId,
      circleId: input.circleId,
      candidateId: input.candidateId,
      proposerId,
      kind: input.kind ?? "add",
      allowHistory: input.allowHistory,
      status,
      expiresAt: threeDaysFromNow(),
      createdAt: now,
    });
    if (activeMembers.length > 1) {
      await transaction.insert(circleProposalApprovals).values(
        activeMembers.map((member) => ({
          proposalId,
          userId: member.userId,
          decision: member.userId === proposerId ? "approved" as const : "pending" as const,
          respondedAt: member.userId === proposerId ? now : null,
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
  const periods = await getCirclePeriods(userId, circleId);
  if (!circle || circle.status !== "active" || periods.length === 0) {
    throw new Error("这个圈子目前不能申请重新加入。");
  }
  if (periods.some((period) => period.leftAt === null)) {
    throw new Error("你已经是圈子的活跃成员。");
  }
  const existing = await db
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
  if (existing.length) throw new Error("你已经有一项待处理的重新加入申请。");

  const activeMembers = await db
    .select({ userId: circleMembershipPeriods.userId })
    .from(circleMembershipPeriods)
    .where(
      and(
        eq(circleMembershipPeriods.circleId, circleId),
        isNull(circleMembershipPeriods.leftAt),
      ),
    );
  if (activeMembers.length === 0) throw new Error("圈子目前没有活跃成员处理申请。");

  const proposalId = randomUUID();
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(circleJoinProposals).values({
      id: proposalId,
      circleId,
      candidateId: userId,
      proposerId: userId,
      kind: "rejoin",
      allowHistory: false,
      status: "pending_approval",
      expiresAt: threeDaysFromNow(),
      createdAt: now,
    });
    await transaction.insert(circleProposalApprovals).values(
      activeMembers.map((member) => ({ proposalId, userId: member.userId })),
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
  if (!proposal || !activeProposalStatuses.includes(proposal.status as typeof activeProposalStatuses[number])) {
    throw new Error("这项邀请已经失效或处理完成。");
  }

  if (proposal.candidateId === userId && proposal.status === "awaiting_candidate") {
    if (decision === "decline") {
      await db
        .update(circleJoinProposals)
        .set({ status: "declined", resolvedAt: new Date() })
        .where(eq(circleJoinProposals.id, proposalId));
      return;
    }

    if (proposal.kind !== "initial") {
      const activeMembers = await db
        .select({ userId: circleMembershipPeriods.userId })
        .from(circleMembershipPeriods)
        .where(
          and(
            eq(circleMembershipPeriods.circleId, proposal.circleId),
            isNull(circleMembershipPeriods.leftAt),
          ),
        );
      const approvals = await db
        .select({ userId: circleProposalApprovals.userId, decision: circleProposalApprovals.decision })
        .from(circleProposalApprovals)
        .where(eq(circleProposalApprovals.proposalId, proposalId));
      const approvedIds = new Set(
        approvals.filter((approval) => approval.decision === "approved").map((approval) => approval.userId),
      );
      const missing = activeMembers.filter((member) => !approvedIds.has(member.userId));
      if (missing.length > 0) {
        await db.transaction(async (transaction) => {
          await transaction
            .insert(circleProposalApprovals)
            .values(missing.map((member) => ({ proposalId, userId: member.userId })))
            .onConflictDoNothing();
          await transaction
            .update(circleJoinProposals)
            .set({ status: "pending_approval" })
            .where(eq(circleJoinProposals.id, proposalId));
        });
        throw new Error("圈子成员发生了变化，需要补齐新的成员确认。");
      }
    }

    const now = new Date();
    const previousPeriods = await getCirclePeriods(userId, proposal.circleId);
    const lastLeftAt = previousPeriods
      .map((period) => period.leftAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const visibleFrom = proposal.allowHistory ? (lastLeftAt ?? null) : now;
    await db.transaction(async (transaction) => {
      await transaction.insert(circleMembershipPeriods).values({
        id: randomUUID(),
        circleId: proposal.circleId,
        userId,
        visibleFrom,
        joinedAt: now,
        lastViewedAt: now,
      });
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
        type: proposal.kind === "rejoin" ? "member_rejoined" : "member_joined",
        message: proposal.kind === "rejoin" ? "重新回到了圈子。" : "加入了这个小圈子。",
        createdAt: now,
      });
    });
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
      .set({ decision: decision === "accept" ? "approved" : "declined", respondedAt: now })
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
  const periods = await getCirclePeriods(userId, circleId);
  const activePeriod = periods.find((period) => period.leftAt === null);
  if (!activePeriod) throw new Error("你已经不在这个圈子的活跃关系中了。");
  const now = new Date();
  const circlePosts = await db
    .select({
      id: posts.id,
      body: posts.body,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      lastEditedById: posts.lastEditedById,
    })
    .from(posts)
    .where(eq(posts.circleId, circleId));
  const visiblePosts = circlePosts.filter((post) =>
    periods.some((period) => periodCanSeeCreatedAt(period, post.createdAt)),
  );

  await db.transaction(async (transaction) => {
    if (visiblePosts.length > 0) {
      await transaction
        .insert(circlePostSnapshots)
        .values(visiblePosts.map((post) => ({
          postId: post.id,
          userId,
          body: post.body,
          updatedAt: post.updatedAt,
          lastEditedById: post.lastEditedById,
          capturedAt: now,
        })))
        .onConflictDoUpdate({
          target: [circlePostSnapshots.postId, circlePostSnapshots.userId],
          set: {
            body: sql`excluded.body`,
            updatedAt: sql`excluded.updated_at`,
            lastEditedById: sql`excluded.last_edited_by_id`,
            capturedAt: now,
          },
        });
    }
    await transaction
      .update(circleMembershipPeriods)
      .set({ leftAt: now })
      .where(eq(circleMembershipPeriods.id, activePeriod.id));
    await transaction
      .update(circles)
      .set({ updatedAt: now })
      .where(eq(circles.id, circleId));
    await transaction.insert(circleEvents).values({
      id: randomUUID(),
      circleId,
      actorId: userId,
      type: "member_left",
      message: "退出了圈子的活跃关系，过去的共同记录仍会保留。",
      createdAt: now,
    });
  });
}
