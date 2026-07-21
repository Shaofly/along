import { PostStream } from "@/app/components/PostStream";
import { SkeletonReveal } from "@/app/components/SkeletonReveal";
import { CircleSummaryList, FriendSummaryList } from "@/app/components/SummaryList";
import { getCircleDashboard } from "@/lib/circles";
import { getVisiblePosts } from "@/lib/content";
import { getFriends } from "@/lib/invitations";

function mapFriends(friends: Awaited<ReturnType<typeof getFriends>>) {
  return friends.map((friend) => ({
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
}

export async function HomeCircleList({ userId }: { userId: string }) {
  const dashboard = await getCircleDashboard(userId);
  const circles = dashboard.circles.filter((circle) => circle.isActive && circle.status === "active");
  return <SkeletonReveal initialHeight={142}><CircleSummaryList circles={circles} /></SkeletonReveal>;
}

export async function HomeFriendList({ userId }: { userId: string }) {
  const friends = mapFriends(await getFriends(userId));
  return <SkeletonReveal initialHeight={174}><FriendSummaryList friends={friends} /></SkeletonReveal>;
}

export async function HomeLatestFeed({ userId }: { userId: string }) {
  const [posts, friends] = await Promise.all([
    getVisiblePosts(userId, { limit: 5 }),
    getFriends(userId),
  ]);
  return (
    <SkeletonReveal initialHeight={310}>
      <PostStream friends={mapFriends(friends)} posts={posts} />
    </SkeletonReveal>
  );
}
