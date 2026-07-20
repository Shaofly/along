import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getProfileForViewer } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { safeReturnPath } from "@/lib/navigation";
import { getShellUser } from "@/lib/users";

import { ProfileEditor } from "../ProfileEditor";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (id !== session.user.id) notFound();
  const [currentUser, profile, friendRows] = await Promise.all([
    getShellUser(session.user.id),
    getProfileForViewer(session.user.id, id, { limit: 1 }),
    getFriends(session.user.id),
  ]);
  if (!currentUser || !profile) notFound();
  const returnHref = safeReturnPath(query.returnTo, `/profile/${id}`);

  return (
    <AppShell pageClassName="profile-editor-page" user={currentUser}>
      <ProfileEditor
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
        presentation="page"
        profile={profile}
        returnHref={returnHref}
      />
    </AppShell>
  );
}
