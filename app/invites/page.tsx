import { and, count, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { invitations, invitationSponsors, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { decryptInvitationCode, getFriends } from "@/lib/invitations";

import { InviteManager } from "./InviteManager";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const creator = alias(user, "creator");
  const [friends, pendingInvitations, createdRows] = await Promise.all([
    getFriends(session.user.id),
    db
      .select({
        id: invitations.id,
        invitedName: invitations.invitedName,
        invitedEmail: invitations.invitedEmail,
        creatorName: creator.name,
        expiresAt: invitations.expiresAt,
      })
      .from(invitationSponsors)
      .innerJoin(
        invitations,
        eq(invitationSponsors.invitationId, invitations.id),
      )
      .innerJoin(creator, eq(invitations.createdById, creator.id))
      .where(
        and(
          eq(invitationSponsors.userId, session.user.id),
          eq(invitationSponsors.status, "pending"),
          eq(invitations.status, "pending"),
        ),
      ),
    db
      .select({
        id: invitations.id,
        invitedName: invitations.invitedName,
        invitedEmail: invitations.invitedEmail,
        status: invitations.status,
        encryptedCode: invitations.encryptedCode,
        expiresAt: invitations.expiresAt,
        sponsorCount: count(invitationSponsors.userId),
        confirmedCount: sql<number>`count(*) filter (where ${invitationSponsors.status} = 'confirmed')`,
      })
      .from(invitations)
      .leftJoin(
        invitationSponsors,
        eq(invitationSponsors.invitationId, invitations.id),
      )
      .where(eq(invitations.createdById, session.user.id))
      .groupBy(invitations.id)
      .orderBy(sql`${invitations.createdAt} desc`),
  ]);

  const createdInvitations = createdRows.map((invitation) => ({
    id: invitation.id,
    invitedName: invitation.invitedName,
    invitedEmail: invitation.invitedEmail,
    status: invitation.status,
    confirmedCount: Number(invitation.confirmedCount),
    sponsorCount: Number(invitation.sponsorCount),
    code:
      invitation.status === "ready"
        ? decryptInvitationCode(invitation.encryptedCode)
        : null,
    expiresAt: invitation.expiresAt.toISOString(),
  }));

  return (
    <main className="invites-shell">
      <header className="invites-topbar">
        <a className="brand" href="/home">
          <span className="brand-mark" aria-hidden="true">圆</span>
          <span>圆个圈 <small>Along</small></span>
        </a>
        <a className="secondary-action" href="/home">返回主页</a>
      </header>
      <div className="invites-intro">
        <p className="eyebrow">熟人共同确认，关系才真正开始</p>
        <h1>邀请朋友加入</h1>
        <p>
          你先发起邀请，再由至少一位朋友确认。邀请码最多绑定 5 位邀请人，
          新成员注册后会自动与所有确认邀请的人成为朋友。
        </p>
      </div>
      <InviteManager
        friends={friends}
        pendingInvitations={pendingInvitations.map((invitation) => ({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
        }))}
        createdInvitations={createdInvitations}
      />
    </main>
  );
}
