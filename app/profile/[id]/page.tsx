import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getProfileForViewer } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";
import type { ProfileViewMode } from "@/lib/content-types";

import { ProfileView } from "./ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const view: ProfileViewMode =
    requestedView === "personal" ||
    requestedView === "shared" ||
    requestedView === "private"
      ? requestedView
      : "all";
  const [currentUser, profile, friendRows] = await Promise.all([
    getShellUser(session.user.id),
    getProfileForViewer(session.user.id, id, { view }),
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
        bio: friend.bio,
      }))}
      profile={profile}
    />
  );
}
