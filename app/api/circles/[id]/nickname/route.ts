import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { circleEvents, circleMembershipPeriods } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActiveCircleMembership } from "@/lib/circles";

const nicknameSchema = z.object({
  nickname: z.string().trim().max(40, "圈子昵称不能超过 40 个字"),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id: circleId } = await params;
  const parsed = nicknameSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "请检查圈子昵称。" }, { status: 400 });
  }

  const membership = await getActiveCircleMembership(
    session.user.id,
    circleId,
  );
  if (!membership) {
    return NextResponse.json(
      { error: "只有活跃成员可以设置圈子昵称。" },
      { status: 403 },
    );
  }

  await db
    .update(circleMembershipPeriods)
    .set({ circleNickname: parsed.data.nickname || null })
    .where(eq(circleMembershipPeriods.id, membership.id));

  await db.insert(circleEvents).values({
    id: crypto.randomUUID(),
    circleId,
    actorId: session.user.id,
    type: "member_nickname_changed",
    message: parsed.data.nickname ? `将圈子昵称改成了“${parsed.data.nickname}”。` : "清除了自己的圈子昵称。",
  });

  return NextResponse.json({ ok: true });
}
