import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCircleDashboard } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { CirclesClient } from "./CirclesClient";

export const dynamic = "force-dynamic";

export default async function CirclesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [currentUser, dashboard, friends] = await Promise.all([
    getShellUser(session.user.id),
    getCircleDashboard(session.user.id),
    getFriends(session.user.id),
  ]);
  if (!currentUser) redirect("/");

  return (
    <AppShell pageClassName="circle-page" user={currentUser}>
      <div className="circle-page-inner">
        <CirclesClient
          actions={dashboard.actions}
          circles={dashboard.circles}
          friends={friends.map((friend) => ({
            id: friend.id,
            name: friend.name,
            realName: friend.realName,
            nickname: friend.nickname,
            identityName: friend.identityName,
            displayName: friend.displayName,
            remark: friend.remark,
            image: friend.image,
          }))}
        />
      </div>
    </AppShell>
  );
}
import { AppShell } from "@/app/components/AppShell";
