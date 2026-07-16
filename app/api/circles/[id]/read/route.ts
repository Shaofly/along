import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { circleMembershipPeriods } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getActiveCircleMembership } from "@/lib/circles";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const { id } = await context.params;
  const membership = await getActiveCircleMembership(session.user.id, id);
  if (!membership) {
    return NextResponse.json({ error: "当前不在这个圈子的活跃关系中。" }, { status: 403 });
  }

  await db
    .update(circleMembershipPeriods)
    .set({ lastViewedAt: new Date() })
    .where(eq(circleMembershipPeriods.id, membership.id));
  return NextResponse.json({ ok: true });
}
