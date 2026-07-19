import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { saveDraftSchema } from "@/lib/draft-contracts";
import {
  DraftMutationError,
  saveDraft,
} from "@/lib/draft-mutations";
import { deleteDraftWithAssets, getDraftDetail } from "@/lib/drafts";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const draft = await getDraftDetail(session.user.id, id);
  if (!draft) return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
  return NextResponse.json({ draft });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const parsed = saveDraftSchema.safeParse({
    ...(await request.json()),
    id,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查草稿内容。" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await saveDraft(session.user.id, parsed.data));
  } catch (error) {
    if (error instanceof DraftMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "草稿保存失败。", code: "temporary_failure" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const { id } = await context.params;
  const deleted = await deleteDraftWithAssets(session.user.id, id);
  if (!deleted) return NextResponse.json({ error: "草稿不存在。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
