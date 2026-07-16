import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createCircle } from "@/lib/circles";
import { getFriends } from "@/lib/invitations";

const createCircleSchema = z.object({
  name: z.string().trim().min(1, "给圈子起一个名字。 ").max(40, "圈子名称不能超过 40 个字。"),
  description: z.string().trim().max(160, "圈子简介不能超过 160 个字。").default(""),
  invitedUserIds: z.array(z.string()).min(1, "至少邀请一位朋友。 ").max(4, "初始最多邀请四位朋友。"),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const parsed = createCircleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查圈子信息。" },
      { status: 400 },
    );
  }
  const invitedUserIds = [...new Set(parsed.data.invitedUserIds)].filter(
    (id) => id !== session.user.id,
  );
  if (invitedUserIds.length < 1 || invitedUserIds.length > 4) {
    return NextResponse.json({ error: "请选择 1 至 4 位朋友。" }, { status: 400 });
  }
  const friends = await getFriends(session.user.id);
  const friendIds = new Set(friends.map((friend) => friend.id));
  if (!invitedUserIds.every((id) => friendIds.has(id))) {
    return NextResponse.json({ error: "初始成员必须是你的直接朋友。" }, { status: 403 });
  }

  const circleId = await createCircle(session.user.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    invitedUserIds,
  });
  return NextResponse.json({ ok: true, circleId });
}
