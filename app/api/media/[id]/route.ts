import { and, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  circleExitSnapshotMedia,
  draftMedia,
  mediaAssets,
  postMedia,
  userProfileAppearance,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { canAccessMedia } from "@/lib/media/access";
import { mediaResponse } from "@/lib/media/response";
import { deleteMediaAsset } from "@/lib/media/service";

async function findAsset(id: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  return asset ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response(null, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const { id } = await context.params;
  if (!(await canAccessMedia(session.user.id, id))) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }
  return mediaResponse(id, "preview", {
    ifNoneMatch: request.headers.get("if-none-match"),
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { id } = await context.params;
  const asset = await findAsset(id);
  if (!asset || asset.ownerId !== session.user.id) {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }

  const [link] = await db
    .select({ postId: postMedia.postId })
    .from(postMedia)
    .where(and(eq(postMedia.mediaId, id)))
    .limit(1);
  if (link) {
    return NextResponse.json({ error: "已发布的图片不能单独移除。" }, { status: 409 });
  }
  const [draftLink] = await db
    .select({ draftId: draftMedia.draftId })
    .from(draftMedia)
    .where(eq(draftMedia.mediaId, id))
    .limit(1);
  if (draftLink) {
    return NextResponse.json({ error: "草稿中的图片需要随草稿更新。" }, { status: 409 });
  }
  const [archiveLink] = await db
    .select({ snapshotPostId: circleExitSnapshotMedia.snapshotPostId })
    .from(circleExitSnapshotMedia)
    .where(eq(circleExitSnapshotMedia.mediaId, id))
    .limit(1);
  if (archiveLink) {
    return NextResponse.json(
      { error: "这张图片仍属于一份退出档案，不能单独删除。" },
      { status: 409 },
    );
  }
  const [profileLink] = await db
    .select({ userId: userProfileAppearance.userId })
    .from(userProfileAppearance)
    .where(
      or(
        eq(userProfileAppearance.avatarMediaId, id),
        eq(userProfileAppearance.coverMediaId, id),
      ),
    )
    .limit(1);
  if (profileLink) {
    return NextResponse.json(
      { error: "这张图片仍是头像或个人封面，请先在资料中替换或移除。" },
      { status: 409 },
    );
  }

  const deleted = await deleteMediaAsset(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "这张图片仍被历史档案使用，不能单独删除。" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
