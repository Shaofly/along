import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getFriends } from "@/lib/invitations";
import { getShellUser } from "@/lib/users";

import { FriendsClient } from "./FriendsClient";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const [currentUser, friends] = await Promise.all([
    getShellUser(session.user.id),
    getFriends(session.user.id),
  ]);
  if (!currentUser) redirect("/");

  return <FriendsClient currentUser={currentUser} friends={friends} />;
}
