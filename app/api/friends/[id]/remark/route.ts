import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { friendRemarks, friendships } from "@/db/schema";
import { auth } from "@/lib/auth";

const remarkSchema = z.object({
  remark: z.string().trim().max(40, "备注不能超过 40 个字"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const { id: friendId } = await params;
  const parsed = remarkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "请检查备注。" }, { status: 400 });
  }

  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userOneId, session.user.id), eq(friendships.userTwoId, friendId)),
        and(eq(friendships.userOneId, friendId), eq(friendships.userTwoId, session.user.id)),
      ),
    )
    .limit(1);
  if (!friendship) return NextResponse.json({ error: "只能备注自己的朋友。" }, { status: 403 });

  if (!parsed.data.remark) {
    await db.delete(friendRemarks).where(
      and(eq(friendRemarks.ownerId, session.user.id), eq(friendRemarks.friendId, friendId)),
    );
  } else {
    await db
      .insert(friendRemarks)
      .values({ ownerId: session.user.id, friendId, remark: parsed.data.remark, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [friendRemarks.ownerId, friendRemarks.friendId],
        set: { remark: parsed.data.remark, updatedAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
}
