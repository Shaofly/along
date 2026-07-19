import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getCircleDetail } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { CircleMemberActions } from "./CircleMemberActions";

export const dynamic = "force-dynamic";

function periodLabel(joinedAt: string, leftAt: string | null) {
  const format = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" });
  return `${format.format(new Date(joinedAt))}加入${leftAt ? `，${format.format(new Date(leftAt))}退出` : "，现在仍在圈内"}`;
}

export default async function CircleMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const { id } = await params;
  const [currentUser, circle, friends] = await Promise.all([
    getShellUser(session.user.id),
    getCircleDetail(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!circle || !currentUser) notFound();
  const activeMembers = circle.members.filter((member) => member.isActive);
  const formerMembers = circle.members.filter((member) => !member.isActive);
  const archivedMembers = circle.isArchived ? circle.members : [];

  return (
    <AppShell pageClassName="circle-members-page" user={currentUser}>
      <header className="circle-detail-header">
        <Link href={`/circles/${circle.id}`} aria-label="返回圈子">←</Link>
        <div><span>成员关系</span><strong>{circle.name}</strong></div>
        <span>{circle.isArchived ? archivedMembers.length : activeMembers.length} 人</span>
      </header>
      <div className="circle-members-inner">
        {circle.isArchived ? (
          <section>
            <p className="eyebrow">退出时的成员</p>
            <h1>这份档案冻结时，一起留在圈子里的人</h1>
            <div className="circle-member-list">
              {archivedMembers.map((member) => (
                <article key={member.id}>
                  <span>{member.name.slice(0, 1)}</span>
                  <div>
                    <strong>
                      {member.circleNickname ?? member.nickname ?? member.name}
                      {(member.circleNickname || member.nickname)
                        ? `（${member.realName}）`
                        : ""}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <p className="eyebrow">当前成员</p>
            <h1>现在一起留在这里的人</h1>
            <div className="circle-member-list">
              {activeMembers.map((member) => (
                <article key={member.id}>
                  <span>{member.name.slice(0, 1)}</span>
                  <div><strong>{member.circleNickname ?? member.nickname ?? member.name}{(member.circleNickname || member.nickname) ? `（${member.realName}）` : ""}</strong><small>{periodLabel(member.periods.at(-1)!.joinedAt, null)}</small></div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!circle.isArchived && formerMembers.length ? (
          <section>
            <p className="eyebrow">曾经的成员</p>
            <h2>关系离开了，记录没有消失</h2>
            <div className="circle-member-list former">
              {formerMembers.map((member) => (
                <article key={member.id}>
                  <span>{member.name.slice(0, 1)}</span>
                  <div>
                    <strong>{member.name}</strong>
                    {member.periods.map((period) => <small key={period.id}>{periodLabel(period.joinedAt, period.leftAt)}</small>)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <CircleMemberActions
          activeMemberIds={activeMembers.map((member) => member.id)}
          circleStatus={circle.status}
          circleId={circle.id}
          circleName={circle.name}
          currentNickname={activeMembers.find((member) => member.id === session.user.id)?.circleNickname ?? ""}
          friends={friends.map((friend) => ({
            id: friend.id,
            name: friend.name,
            realName: friend.realName,
            nickname: friend.nickname,
            identityName: friend.identityName,
            displayName: friend.displayName,
            remark: friend.remark,
            image: friend.image,
            bio: friend.bio,
          }))}
          viewerIsActive={circle.isActive}
          viewerHasArchive={circle.isArchived}
          canRestore={circle.canRestore}
        />
      </div>
    </AppShell>
  );
}
