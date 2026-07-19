import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { saveDraftSchema } from "@/lib/draft-contracts";
import {
  DraftMutationError,
  forkDraft,
} from "@/lib/draft-mutations";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  const parsed = saveDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查草稿内容。" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await forkDraft(session.user.id, id, parsed.data));
  } catch (error) {
    if (error instanceof DraftMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "另存草稿失败。",
        code: "temporary_failure",
      },
      { status: 500 },
    );
  }
}
