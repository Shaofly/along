import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";

export function identityName(person: { realName: string; nickname: string | null }) {
  return person.nickname ? `${person.nickname}（${person.realName}）` : person.realName;
}

export async function getShellUser(userId: string) {
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      realName: user.realName,
      nickname: user.nickname,
      image: user.image,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return profile ?? null;
}
