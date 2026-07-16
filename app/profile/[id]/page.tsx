import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getProfileForViewer } from "@/lib/content";
import { getFriends } from "@/lib/invitations";

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
  const [profile, friendRows] = await Promise.all([
    getProfileForViewer(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!profile) notFound();

  return (
    <ProfileView
      currentUser={{ id: session.user.id, name: session.user.name }}
      friends={friendRows.map((friend) => ({
        id: friend.id,
        name: friend.name,
        image: friend.image,
      }))}
      profile={profile}
    />
  );
}
