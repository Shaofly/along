import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import {
  getDraftDetail,
  getDraftList,
  type DraftTargetFilter,
} from "@/lib/drafts";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { DraftBoxClient } from "./DraftBoxClient";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{
    circleId?: string | string[];
    draftId?: string | string[];
    page?: string | string[];
    target?: string | string[];
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const query = await searchParams;
  const rawTarget = first(query.target);
  const target: DraftTargetFilter =
    rawTarget === "personal" || rawTarget === "circle" ? rawTarget : "all";
  const rawPage = Number(first(query.page) ?? "1");
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const circleId = first(query.circleId);
  const draftId = first(query.draftId);
  const [currentUser, friends, draftList, selectedDraft] = await Promise.all([
    getShellUser(session.user.id),
    getFriends(session.user.id),
    getDraftList(session.user.id, {
      circleId,
      limit: 18,
      page,
      target,
    }),
    draftId
      ? getDraftDetail(session.user.id, draftId)
      : Promise.resolve(null),
  ]);
  if (!currentUser) redirect("/");

  return (
    <AppShell pageClassName="draft-box-page" user={currentUser}>
      <DraftBoxClient
        circleId={circleId}
        currentUserId={session.user.id}
        drafts={draftList.drafts}
        friends={friends}
        page={draftList.page}
        pageCount={draftList.pageCount}
        selectedDraft={selectedDraft}
        target={target}
        total={draftList.total}
      />
    </AppShell>
  );
}
