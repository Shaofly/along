import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { friendships, user } from "@/db/schema";
import { auth } from "@/lib/auth";

const setupSchema = z.object({
  name: z.string().trim().min(1, "请输入昵称").max(40),
  email: z.email("请输入有效邮箱").transform((value) => value.toLowerCase()),
  password: z.string().min(10, "密码至少需要 10 位").max(128),
  bootstrapKey: z.string().min(1, "请输入创建密钥"),
});

export async function POST(request: Request) {
  const parsed = setupSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查创建信息" },
      { status: 400 },
    );
  }

  if (parsed.data.bootstrapKey !== process.env.BOOTSTRAP_KEY) {
    return NextResponse.json({ error: "创建密钥不正确。" }, { status: 403 });
  }

  try {
    const setupResult = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(742601)`);

      const [{ total }] = await transaction
        .select({ total: count() })
        .from(user);
      if (total >= 2) {
        return { error: "创始成员已经创建完成。", status: 409 } as const;
      }

      const existingUsers = await transaction
        .select({ id: user.id })
        .from(user)
        .limit(1);
      const result = await auth.api.signUpEmail({
        body: {
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        },
        headers: new Headers({
          "x-registration-gate": process.env.REGISTRATION_GATE_SECRET ?? "",
        }),
      });

      const role = total === 0 ? "admin" : "member";
      await transaction
        .update(user)
        .set({ role })
        .where(eq(user.id, result.user.id));

      if (existingUsers[0]) {
        const [userOneId, userTwoId] = [
          existingUsers[0].id,
          result.user.id,
        ].sort();
        await transaction
          .insert(friendships)
          .values({ id: randomUUID(), userOneId, userTwoId })
          .onConflictDoNothing();
      }

      return {
        ok: true,
        role,
        remaining: Math.max(0, 1 - total),
      } as const;
    });

    if ("error" in setupResult) {
      return NextResponse.json(
        { error: setupResult.error },
        { status: setupResult.status },
      );
    }

    return NextResponse.json(setupResult);
  } catch {
    return NextResponse.json(
      { error: "创建失败，该邮箱可能已经注册。" },
      { status: 400 },
    );
  }
}
