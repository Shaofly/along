import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { restoreFrozenCircle } from "@/lib/circles";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    await restoreFrozenCircle(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "恢复圈子失败。",
      },
      { status: 400 },
    );
  }
}
