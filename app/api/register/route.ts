import { APIError } from "better-auth/api";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  completeInvitationRegistration,
  validateInvitation,
} from "@/lib/invitations";

const registrationSchema = z.object({
  name: z.string().trim().min(1, "请输入昵称").max(40, "昵称不能超过 40 个字"),
  email: z.email("请输入有效邮箱").transform((value) => value.toLowerCase()),
  password: z.string().min(10, "密码至少需要 10 位").max(128),
  inviteCode: z.string().trim().min(6, "请输入有效邀请码").max(64),
});

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查注册信息" },
      { status: 400 },
    );
  }

  const { name, email, password, inviteCode } = parsed.data;
  const validated = await validateInvitation(inviteCode, email);

  if (!validated) {
    return NextResponse.json(
      { error: "邀请码无效、已过期，或邀请邮箱不一致。" },
      { status: 400 },
    );
  }

  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: new Headers({
        "x-registration-gate": process.env.REGISTRATION_GATE_SECRET ?? "",
      }),
    });

    await completeInvitationRegistration(
      validated.invitation.id,
      result.user.id,
      validated.sponsorIds,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message || "注册失败，请稍后再试。" },
        { status: error.statusCode ?? 400 },
      );
    }

    return NextResponse.json(
      { error: "注册失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
