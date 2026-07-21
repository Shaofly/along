import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PostStream } from "@/app/components/PostStream";
import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [currentUser, posts, friendRows] = await Promise.all([
    getShellUser(session.user.id),
    getVisiblePosts(session.user.id, { limit: 50 }),
    getFriends(session.user.id),
  ]);
  if (!currentUser) redirect("/");
  const friends = friendRows.map((friend) => ({
    id: friend.id,
    name: friend.name,
    realName: friend.realName,
    nickname: friend.nickname,
    identityName: friend.identityName,
    displayName: friend.displayName,
    identityProtected: friend.identityProtected,
    remark: friend.remark,
    image: friend.image,
    bio: friend.bio,
  }));

  return (
    <AppShell pageClassName="profile-page" user={currentUser}>
      <section className="full-feed-page">
        <div className="section-line-heading">
          <div>
            <p className="eyebrow">全部动态</p>
            <h1>最近留下的片段</h1>
          </div>
          <span>{posts.length} 条可见</span>
        </div>
        <PostStream friends={friends} posts={posts} />
      </section>
    </AppShell>
  );
}
