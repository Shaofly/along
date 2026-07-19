import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { FullComposer } from "@/app/components/FullComposer";
import { auth } from "@/lib/auth";
import { getCircleDetail } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function CircleComposePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const { id } = await params;
  const [currentUser, circle, friends] = await Promise.all([
    getShellUser(session.user.id),
    getCircleDetail(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!currentUser || !circle || !circle.isActive || circle.status !== "active") {
    notFound();
  }
  const members = circle.members
    .filter((member) => member.isActive)
    .map((member) => ({
      id: member.id,
      name: member.name,
      realName: member.realName,
      isActive: true,
    }));

  return (
    <AppShell pageClassName="composer-page" user={currentUser}>
      <div className="composer-page-frame">
        <FullComposer
          circleMembers={members}
          currentUserId={session.user.id}
          friends={friends}
          presentation="page"
          returnHref={`/circles/${id}`}
          target={{ kind: "circle", id, name: circle.name }}
        />
      </div>
    </AppShell>
  );
}
