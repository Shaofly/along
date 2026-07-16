import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCircleDashboard } from "@/lib/circles";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { SocialHome } from "./SocialHome";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const [currentUser, posts, ownPosts, friendRows, circleDashboard] = await Promise.all([
    getShellUser(session.user.id),
    getVisiblePosts(session.user.id, { limit: 5 }),
    getVisiblePosts(session.user.id, { authorId: session.user.id, limit: 20 }),
    getFriends(session.user.id),
    getCircleDashboard(session.user.id),
  ]);
  if (!currentUser) redirect("/");

  const boardMedia = ownPosts.flatMap((post) => post.media).slice(0, 3);

  return (
    <SocialHome
      boardMedia={boardMedia}
      currentUser={currentUser}
      circles={circleDashboard.circles.filter((circle) => circle.isActive && circle.status === "active")}
      friends={friendRows.map((friend) => ({
        id: friend.id,
        name: friend.name,
        realName: friend.realName,
        nickname: friend.nickname,
        identityName: friend.identityName,
        displayName: friend.displayName,
        remark: friend.remark,
        image: friend.image,
      }))}
      key={boardMedia.map((media) => media.id).join(":") || "empty-board"}
      posts={posts}
    />
  );
}
