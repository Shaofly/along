import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CircleCreateForm } from "@/app/circles/CircleCreateForm";
import { AppShell } from "@/app/components/AppShell";
import { auth } from "@/lib/auth";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function CircleCreatePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [currentUser, friends] = await Promise.all([
    getShellUser(session.user.id),
    getFriends(session.user.id),
  ]);
  if (!currentUser) redirect("/");

  return (
    <AppShell
      mobileHeader={{ mode: "detail", title: "建立圈子" }}
      pageClassName="circle-create-page"
      user={currentUser}
    >
      <div className="circle-create-page-inner">
        <header>
          <Link aria-label="返回圈子" href="/circles">
            <ArrowLeft aria-hidden="true" size={21} strokeWidth={1.8} />
          </Link>
          <h1>建立圈子</h1>
        </header>
        <CircleCreateForm
          friends={friends.map((friend) => ({
            id: friend.id,
            name: friend.name,
            realName: friend.realName,
            nickname: friend.nickname,
            identityName: friend.identityName,
            displayName: friend.displayName,
            identityProtected: friend.identityProtected,
            remark: friend.remark,
            image: friend.image,
            bio: friend.bio,
          }))}
          presentation="page"
        />
      </div>
    </AppShell>
  );
}
