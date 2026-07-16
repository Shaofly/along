import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { respondToCircleProposal } from "@/lib/circles";

const responseSchema = z.object({ decision: z.enum(["accept", "decline"]) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = responseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "请选择同意或拒绝。" }, { status: 400 });

  try {
    const { id } = await context.params;
    await respondToCircleProposal(session.user.id, id, parsed.data.decision);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "处理失败。" },
      { status: 400 },
    );
  }
}
