import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { invitations, invitationSponsors, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  createInvitationCode,
  encryptInvitationCode,
  getFriends,
  hashInvitationCode,
} from "@/lib/invitations";

const createInvitationSchema = z.object({
  invitedName: z.string().trim().max(40).optional(),
  invitedEmail: z.email("请输入有效邮箱").transform((value) => value.toLowerCase()),
  sponsorIds: z.array(z.string()).min(1, "至少选择一位共同邀请人").max(4),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const parsed = createInvitationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查邀请信息" },
      { status: 400 },
    );
  }

  const uniqueSponsorIds = [...new Set(parsed.data.sponsorIds)].filter(
    (id) => id !== session.user.id,
  );
  if (uniqueSponsorIds.length < 1 || uniqueSponsorIds.length > 4) {
    return NextResponse.json(
      { error: "共同邀请人数量必须为 1 至 4 位。" },
      { status: 400 },
    );
  }

  const friends = await getFriends(session.user.id);
  const friendIds = new Set(friends.map((friend) => friend.id));
  if (!uniqueSponsorIds.every((id) => friendIds.has(id))) {
    return NextResponse.json(
      { error: "只能选择自己的朋友作为共同邀请人。" },
      { status: 403 },
    );
  }

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, parsed.data.invitedEmail))
    .limit(1);
  if (existingUser) {
    return NextResponse.json(
      { error: "这个邮箱已经注册。" },
      { status: 409 },
    );
  }

  const code = createInvitationCode();
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await db.transaction(async (transaction) => {
    await transaction.insert(invitations).values({
      id: invitationId,
      codeHash: hashInvitationCode(code),
      encryptedCode: encryptInvitationCode(code),
      invitedEmail: parsed.data.invitedEmail,
      invitedName: parsed.data.invitedName || null,
      createdById: session.user.id,
      expiresAt,
      requiredSponsorCount: 2,
      status: "pending",
    });

    await transaction.insert(invitationSponsors).values([
      {
        invitationId,
        userId: session.user.id,
        status: "confirmed",
        respondedAt: new Date(),
      },
      ...uniqueSponsorIds.map((userId) => ({
        invitationId,
        userId,
        status: "pending" as const,
      })),
    ]);
  });

  return NextResponse.json({ ok: true });
}
