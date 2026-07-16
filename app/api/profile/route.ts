import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

const profileSchema = z.object({
  realName: z.string().trim().min(1, "请输入真实姓名").max(40),
  nickname: z.string().trim().max(40, "昵称不能超过 40 个字").optional().transform((value) => value || null),
  bio: z.string().trim().max(160, "简介不能超过 160 个字"),
});

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查个人资料。" },
      { status: 400 },
    );
  }
  const primaryName = parsed.data.nickname ?? parsed.data.realName;
  await db
    .update(user)
    .set({ ...parsed.data, name: primaryName, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));
  return NextResponse.json({ ok: true });
}
