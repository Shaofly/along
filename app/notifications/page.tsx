import { Bell } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const currentUser = await getShellUser(session.user.id);
  if (!currentUser) redirect("/");

  return (
    <AppShell pageClassName="notifications-page" user={currentUser}>
      <section className="simple-page-heading">
        <p className="eyebrow">通知</p>
        <h1>需要你留意的事</h1>
      </section>
      <section className="quiet-empty notification-empty">
        <Bell aria-hidden="true" size={26} />
        <strong>现在没有新通知</strong>
        <p>共同邀请和圈子待办仍可在对应页面处理，后续会汇总到这里。</p>
        <Link href="/invites">查看共同邀请</Link>
      </section>
    </AppShell>
  );
}
