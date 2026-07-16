import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { auth } from "@/lib/auth";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [posts, friendRows] = await Promise.all([
    getVisiblePosts(session.user.id, { limit: 50 }),
    getFriends(session.user.id),
  ]);
  const friends = friendRows.map((friend) => ({
    id: friend.id,
    name: friend.name,
    image: friend.image,
  }));

  return (
    <main className="app-page profile-page">
      <header className="app-header">
        <Link className="brand" href="/home">
          <span className="brand-mark" aria-hidden="true">圆</span>
          <span>圆个圈 <small>Along</small></span>
        </Link>
        <nav className="app-nav">
          <Link href="/home">首页</Link>
          <Link className="active" href="/feed">动态</Link>
          <Link href={`/profile/${session.user.id}`}>我的空间</Link>
        </nav>
      </header>
      <section className="full-feed-page">
        <div className="section-line-heading">
          <div>
            <p className="eyebrow">全部动态</p>
            <h1>最近留下的片段</h1>
          </div>
          <span>{posts.length} 条可见</span>
        </div>
        <PostStream currentUserId={session.user.id} friends={friends} posts={posts} />
      </section>
    </main>
  );
}
