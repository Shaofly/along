import "server-only";

import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { drafts, user, userProfileAppearance } from "@/db/schema";

export function identityName(person: { realName: string; nickname: string | null }) {
  return person.nickname ? `${person.nickname}（${person.realName}）` : person.realName;
}

export async function getShellUser(userId: string) {
  const [profileRows, draftCountRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        realName: user.realName,
        nickname: user.nickname,
        image: user.image,
        avatarMediaId: userProfileAppearance.avatarMediaId,
        role: user.role,
      })
      .from(user)
      .leftJoin(
        userProfileAppearance,
        eq(userProfileAppearance.userId, user.id),
      )
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({ value: count() })
      .from(drafts)
      .where(eq(drafts.authorId, userId)),
  ]);
  const profile = profileRows[0];
  return profile
    ? {
        ...profile,
        image: profile.avatarMediaId
          ? `/api/media/${profile.avatarMediaId}/thumbnail`
          : profile.image,
        draftCount: draftCountRows[0]?.value ?? 0,
      }
    : null;
}
