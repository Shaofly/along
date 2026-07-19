import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { FullComposer } from "@/app/components/FullComposer";
import { auth } from "@/lib/auth";
import { getDraftDetail } from "@/lib/drafts";
import { getFriends } from "@/lib/invitations";
import { safeReturnPath } from "@/lib/navigation";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function DraftEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [currentUser, draft, friends] = await Promise.all([
    getShellUser(session.user.id),
    getDraftDetail(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!currentUser || !draft) notFound();
  const returnHref = safeReturnPath(query.returnTo, "/drafts");
  const target = draft.circle
    ? { kind: "circle" as const, id: draft.circle.id, name: draft.circle.name }
    : { kind: "personal" as const };

  return (
    <AppShell pageClassName="composer-page" user={currentUser}>
      <div className="composer-page-frame">
        <FullComposer
          circleMembers={draft.circleMembers}
          currentUserId={session.user.id}
          friends={friends}
          initialDraft={draft}
          presentation="page"
          returnHref={returnHref}
          target={target}
        />
      </div>
    </AppShell>
  );
}
