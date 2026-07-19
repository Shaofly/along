import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { FullComposer } from "@/app/components/FullComposer";
import { auth } from "@/lib/auth";
import { getFriends } from "@/lib/invitations";
import { safeReturnPath } from "@/lib/navigation";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function PersonalComposePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [currentUser, friends, query] = await Promise.all([
    getShellUser(session.user.id),
    getFriends(session.user.id),
    searchParams,
  ]);
  if (!currentUser) redirect("/");
  const returnHref = safeReturnPath(
    query.returnTo,
    `/profile/${session.user.id}`,
  );

  return (
    <AppShell pageClassName="composer-page" user={currentUser}>
      <div className="composer-page-frame">
        <FullComposer
          currentUserId={session.user.id}
          friends={friends}
          presentation="page"
          returnHref={returnHref}
          target={{ kind: "personal" }}
        />
      </div>
    </AppShell>
  );
}
