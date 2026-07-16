import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createCircleJoinProposal } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";

const proposalSchema = z.object({
  candidateId: z.string().min(1),
  allowHistory: z.boolean().default(true),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = proposalSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "请选择准备邀请的朋友。" }, { status: 400 });

  const friends = await getFriends(session.user.id);
  if (!friends.some((friend) => friend.id === parsed.data.candidateId)) {
    return NextResponse.json({ error: "只能邀请你的直接朋友。" }, { status: 403 });
  }
  try {
    const { id: circleId } = await context.params;
    const proposalId = await createCircleJoinProposal(session.user.id, {
      circleId,
      candidateId: parsed.data.candidateId,
      allowHistory: parsed.data.allowHistory,
    });
    return NextResponse.json({ ok: true, proposalId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发起邀请失败。" },
      { status: 400 },
    );
  }
}
