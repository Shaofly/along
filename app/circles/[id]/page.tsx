import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getCircleDetail } from "@/lib/circles";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { CircleComposer } from "./CircleComposer";

export const dynamic = "force-dynamic";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const { id } = await params;
  const [currentUser, circle, posts, friends] = await Promise.all([
    getShellUser(session.user.id),
    getCircleDetail(session.user.id, id),
    getVisiblePosts(session.user.id, { circleId: id, limit: 40 }),
    getFriends(session.user.id),
  ]);
  if (!circle || !currentUser) notFound();

  return (
    <AppShell pageClassName="circle-detail-page" user={currentUser}>
      <header className="circle-detail-header">
        <Link href="/circles" aria-label="返回圈子列表">←</Link>
        <div><span>{circle.status === "forming" ? "等待成员" : circle.isActive ? "共同生活册" : "历史档案"}</span><strong>{circle.name}</strong></div>
        <Link href={`/circles/${circle.id}/members`}>成员</Link>
      </header>

      <div className="circle-detail-layout">
        <div className="circle-detail-main">
          <section className="circle-cover-band">
            <div>
              <p className="eyebrow">{circle.members.filter((member) => member.isActive).length} 位当前成员</p>
              <h1>{circle.name}</h1>
              <p>{circle.description || "一些普通日子，在这里慢慢成为共同回忆。"}</p>
            </div>
            <div className="circle-cover-members">
              {circle.members.filter((member) => member.isActive).slice(0, 5).map((member) => (
                <span key={member.id}>{member.name.slice(0, 1)}</span>
              ))}
            </div>
          </section>

          {circle.status === "forming" ? (
            <div className="circle-state-note"><strong>正在等第一位朋友加入</strong><p>至少一位受邀朋友接受后，这里才会开始发布共同记录。</p></div>
          ) : circle.isActive ? (
            <CircleComposer circleId={circle.id} circleName={circle.name} />
          ) : (
            <div className="circle-state-note"><strong>这是一份只读的共同档案</strong><p>你仍能查看成员期间留下的内容，但不会看到退出后的新记录。</p></div>
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
