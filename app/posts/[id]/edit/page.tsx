import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { PostEditor } from "@/app/components/PostEditor";
import { auth } from "@/lib/auth";
import { getEditablePost } from "@/lib/content";
import { getFriends } from "@/lib/invitations";
import { safeReturnPath } from "@/lib/navigation";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function PostEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [currentUser, post, friends] = await Promise.all([
    getShellUser(session.user.id),
    getEditablePost(session.user.id, id),
    getFriends(session.user.id),
  ]);
  if (!currentUser || !post) notFound();
  const returnHref = safeReturnPath(query.returnTo, "/home");

  return (
    <AppShell pageClassName="composer-page" user={currentUser}>
      <div className="composer-page-frame">
        <PostEditor
          friends={friends}
          post={post}
          presentation="page"
          returnHref={returnHref}
        />
      </div>
    </AppShell>
  );
}
