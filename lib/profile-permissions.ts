import "server-only";

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  circleMemberRelations,
  friendships,
} from "@/db/schema";

export type ProfileAudience = "self" | "friend" | "circle";
export type ProfileMediaRole = "avatar" | "cover";

export async function getProfileAudience(
  viewerId: string,
  profileId: string,
): Promise<ProfileAudience | null> {
  if (viewerId === profileId) return "self";

  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      or(
        and(
          eq(friendships.userOneId, viewerId),
          eq(friendships.userTwoId, profileId),
        ),
        and(
          eq(friendships.userOneId, profileId),
          eq(friendships.userTwoId, viewerId),
        ),
      ),
    )
    .limit(1);
  if (friendship) return "friend";

  const viewerRelations = await db
    .select({ circleId: circleMemberRelations.circleId })
    .from(circleMemberRelations)
    .where(
      and(
        eq(circleMemberRelations.userId, viewerId),
        isNotNull(circleMemberRelations.activePeriodId),
      ),
    );
  if (!viewerRelations.length) return null;

  const [sharedCircle] = await db
    .select({ circleId: circleMemberRelations.circleId })
    .from(circleMemberRelations)
    .where(
      and(
        eq(circleMemberRelations.userId, profileId),
        isNotNull(circleMemberRelations.activePeriodId),
        inArray(
          circleMemberRelations.circleId,
          viewerRelations.map((relation) => relation.circleId),
        ),
      ),
    )
    .limit(1);
  return sharedCircle ? "circle" : null;
}

export async function canViewProfileMedia(
  viewerId: string,
  profileId: string,
  role: ProfileMediaRole,
) {
  const audience = await getProfileAudience(viewerId, profileId);
  if (!audience) return false;
  if (role === "avatar") return true;
  return audience === "self" || audience === "friend";
}
