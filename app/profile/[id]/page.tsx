import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getProfileForViewer } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { ProfileView } from "./ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const { id } = await params;
  const [currentUser, profile, friendRows] = await Promise.all([
    getShellUser(session.user.id),
    getProfileForViewer(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!profile || !currentUser) notFound();

  return (
    <ProfileView
      currentUser={currentUser}
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
      profile={profile}
    />
  );
}
