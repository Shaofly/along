import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { deleteDraftWithAssets } from "@/lib/drafts";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const { id } = await context.params;
  const deleted = await deleteDraftWithAssets(session.user.id, id);
  if (!deleted) return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
