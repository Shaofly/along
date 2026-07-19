import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { saveDraftSchema } from "@/lib/draft-contracts";
import {
  DraftMutationError,
  saveDraft,
} from "@/lib/draft-mutations";
import {
  getDraftList,
  type DraftTargetFilter,
} from "@/lib/drafts";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

function mutationError(error: unknown) {
  if (error instanceof DraftMutationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "草稿保存失败。",
      code: "temporary_failure",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const url = new URL(request.url);
  const rawTarget = url.searchParams.get("target");
  const target: DraftTargetFilter =
    rawTarget === "personal" || rawTarget === "circle" ? rawTarget : "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "24");
  const result = await getDraftList(session.user.id, {
    circleId: url.searchParams.get("circleId") ?? undefined,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 24,
    target,
  });
  return NextResponse.json(result);
}

async function handleSave(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = saveDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "请检查草稿内容。" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await saveDraft(session.user.id, parsed.data));
  } catch (error) {
    return mutationError(error);
  }
}

export async function POST(request: Request) {
  return handleSave(request);
}

export async function PUT(request: Request) {
  return handleSave(request);
}
