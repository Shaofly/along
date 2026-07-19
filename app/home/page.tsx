import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FeedSkeleton, SummaryListSkeleton } from "@/app/components/SkeletonReveal";
import { auth } from "@/lib/auth";
import { getCircleDashboard } from "@/lib/circles";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { SocialHome } from "./SocialHome";
import { HomeCircleList, HomeFriendList, HomeLatestFeed } from "./HomeSections";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const [currentUser, ownPosts, friendRows, circleDashboard] = await Promise.all([
    getShellUser(session.user.id),
    getVisiblePosts(session.user.id, { profileId: session.user.id, limit: 20 }),
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
        bio: friend.bio,
      }))}
      key={boardMedia.map((media) => media.id).join(":") || "empty-board"}
      circleList={(
        <Suspense fallback={<SummaryListSkeleton rows={2} />}>
          <HomeCircleList userId={session.user.id} />
        </Suspense>
      )}
      friendList={(
        <Suspense fallback={<SummaryListSkeleton rows={3} />}>
          <HomeFriendList userId={session.user.id} />
        </Suspense>
      )}
      latestContent={(
        <Suspense fallback={<FeedSkeleton rows={2} />}>
          <HomeLatestFeed userId={session.user.id} />
        </Suspense>
      )}
    />
  );
}
