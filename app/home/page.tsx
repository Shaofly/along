import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";

import { SocialHome } from "./SocialHome";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const [posts, ownPosts, friendRows] = await Promise.all([
    getVisiblePosts(session.user.id, { limit: 5 }),
    getVisiblePosts(session.user.id, { authorId: session.user.id, limit: 20 }),
    getFriends(session.user.id),
  ]);

  const boardMedia = ownPosts.flatMap((post) => post.media).slice(0, 3);

  return (
    <SocialHome
      boardMedia={boardMedia}
      currentUser={{ id: session.user.id, name: session.user.name }}
      friends={friendRows.map((friend) => ({
        id: friend.id,
        name: friend.name,
        image: friend.image,
      }))}
      key={boardMedia.map((media) => media.id).join(":") || "empty-board"}
      posts={posts}
    />
  );
}
