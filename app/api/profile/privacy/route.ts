import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  friendships,
  user,
  userProfileDetails,
  userProfileDetailViewers,
} from "@/db/schema";
import { auth } from "@/lib/auth";

const privacySchema = z.object({
  protected: z.boolean(),
});

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const parsed = privacySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "请检查隐私保护设置。" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (transaction) => {
    const [owner] = await transaction
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)
      .for("update");
    if (!owner) return { missing: true as const };

    const [details] = await transaction
      .select()
      .from(userProfileDetails)
      .where(eq(userProfileDetails.userId, session.user.id))
      .limit(1)
      .for("update");
    const now = new Date();

    if (parsed.data.protected) {
      const lastSharedVisibility =
        details?.visibility === "all" || details?.visibility === "selected"
          ? details.visibility
          : details?.lastSharedVisibility ?? null;
      await transaction
        .insert(userProfileDetails)
        .values({
          userId: session.user.id,
          contactEmail: owner.email,
          visibility: "private",
          lastSharedVisibility,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userProfileDetails.userId,
          set: {
            visibility: "private",
            lastSharedVisibility,
            updatedAt: now,
          },
        });
      return { visibility: "private" as const };
    }

    const [selectedViewer] =
      details?.lastSharedVisibility === "selected"
        ? await transaction
            .select({ viewerId: userProfileDetailViewers.viewerId })
            .from(userProfileDetailViewers)
            .innerJoin(
              friendships,
              or(
                and(
                  eq(friendships.userOneId, session.user.id),
                  eq(
                    friendships.userTwoId,
                    userProfileDetailViewers.viewerId,
                  ),
                ),
                and(
                  eq(friendships.userTwoId, session.user.id),
                  eq(
                    friendships.userOneId,
                    userProfileDetailViewers.viewerId,
                  ),
                ),
              ),
            )
            .where(
              eq(userProfileDetailViewers.ownerId, session.user.id),
            )
            .limit(1)
        : [];
    const restoreVisibility =
      details?.lastSharedVisibility === "selected" && selectedViewer
        ? "selected"
        : "all";
    await transaction
      .insert(userProfileDetails)
      .values({
        userId: session.user.id,
        contactEmail: owner.email,
        visibility: restoreVisibility,
        lastSharedVisibility: restoreVisibility,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userProfileDetails.userId,
        set: {
          visibility: restoreVisibility,
          lastSharedVisibility: restoreVisibility,
          updatedAt: now,
        },
      });
    return { visibility: restoreVisibility };
  });

  if ("missing" in result) {
    return NextResponse.json({ error: "账号不存在。" }, { status: 404 });
  }
  return NextResponse.json(result);
}
