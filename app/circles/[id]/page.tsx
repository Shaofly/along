import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell } from "@/app/components/AppShell";
import { ComposerLauncher } from "@/app/components/ComposerLauncher";
import { auth } from "@/lib/auth";
import { getCircleDetail } from "@/lib/circles";
import { getCircleArchivePosts, getVisiblePosts } from "@/lib/content";
import { getDraftList } from "@/lib/drafts";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { CircleReadMarker } from "./CircleReadMarker";

export const dynamic = "force-dynamic";

function deletionLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const { id } = await params;
  const [currentUser, circle, friends] = await Promise.all([
    getShellUser(session.user.id),
    getCircleDetail(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!circle || !currentUser) notFound();
  const [posts, circleDrafts] = await Promise.all([
    circle.isActive
      ? getVisiblePosts(session.user.id, { circleId: id, limit: 40 })
      : getCircleArchivePosts(session.user.id, id, 40),
    getDraftList(session.user.id, { circleId: id, limit: 1 }),
  ]);
  const visibleMembers = circle.isArchived
    ? circle.members
    : circle.members.filter((member) => member.isActive);

  return (
    <AppShell pageClassName="circle-detail-page" user={currentUser}>
      {circle.isActive ? <CircleReadMarker circleId={circle.id} /> : null}
      <header className="circle-detail-header">
        <Link href="/circles" aria-label="返回圈子列表">←</Link>
        <div><span>{circle.isActive ? "共同生活册" : circle.status === "frozen" ? "冻结档案" : "历史档案"}</span><strong>{circle.name}</strong></div>
        <Link href={`/circles/${circle.id}/members`}>成员</Link>
      </header>

      <div className="circle-detail-layout">
        <div className="circle-detail-main">
          <section className="circle-cover-band">
            <div>
              <p className="eyebrow">
                {circle.isArchived
                  ? `退出时 ${visibleMembers.length} 位成员`
                  : `${visibleMembers.length} 位当前成员`}
              </p>
              <h1>{circle.name}</h1>
              <p>{circle.description || "一些普通日子，在这里慢慢成为共同回忆。"}</p>
            </div>
            <div className="circle-cover-members">
              {visibleMembers.slice(0, 5).map((member) => (
                <span key={member.id}>{member.name.slice(0, 1)}</span>
              ))}
            </div>
          </section>

          {circle.isActive ? (
            <div className="circle-publish-entry">
              <div>
                <strong>留下一条新的圈子动态</strong>
                <span>桌面端会打开编辑器，手机端进入独立发布页。</span>
              </div>
              {circleDrafts.total > 0 ? (
                <Link href={`/drafts?circleId=${circle.id}`}>
                  草稿 {circleDrafts.total}
                </Link>
              ) : null}
              <ComposerLauncher
                circleMembers={visibleMembers.map((member) => ({
                  id: member.id,
                  name: member.name,
                  realName: member.realName,
                  isActive: true,
                }))}
                currentUserId={session.user.id}
                friends={friends}
                mobileHref={`/circles/${circle.id}/compose`}
                returnHref={`/circles/${circle.id}`}
                target={{ kind: "circle", id: circle.id, name: circle.name }}
              />
            </div>
          ) : (
            <div className="circle-state-note">
              <strong>
                {circle.status === "frozen"
                  ? "圈子已冻结"
                  : "这是一份只读的退出档案"}
              </strong>
              <p>
                {circle.status === "frozen" && circle.deleteAt
                  ? `所有人的历史记录将于 ${deletionLabel(circle.deleteAt)} 彻底删除；恢复后会取消本轮倒计时。`
                  : "这里冻结了你退出时有权查看的最新内容；圈子之后的变化不会继续写进这份档案。"}
              </p>
              {circle.canRestore ? (
                <Link href={`/circles/${circle.id}/members`}>前往恢复圈子</Link>
              ) : null}
            </div>
          )}

          <section className="circle-feed-section">
            <div className="section-line-heading"><div><p className="eyebrow">圈子动态</p><h2>我们一起留下的片段</h2></div></div>
            <PostStream
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
              posts={posts}
            />
          </section>
        </div>

        <aside className="circle-detail-aside">
          <nav aria-label="圈子功能">
            <span>慢慢长出来的地方</span>
            <button disabled type="button">足迹</button>
            <button disabled type="button">共同相册</button>
            <Link href={`/circles/${circle.id}/members`}>成员</Link>
          </nav>
          {circle.events.length ? (
            <section className="circle-event-list">
              <h2>圈子近况</h2>
              {circle.events.slice(0, 8).map((event) => (
                <p key={event.id}>{event.message}</p>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
