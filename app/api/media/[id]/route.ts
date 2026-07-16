import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { draftMedia, mediaAssets, postMedia } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canViewPost } from "@/lib/content";
import { deleteStoredFile, readStoredFile } from "@/lib/storage";

async function findAsset(id: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  return asset ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const { id } = await context.params;
  const asset = await findAsset(id);
  if (!asset) return new Response(null, { status: 404 });

  let allowed = asset.ownerId === session.user.id;
  if (!allowed) {
    const links = await db
      .select({ postId: postMedia.postId })
      .from(postMedia)
      .where(eq(postMedia.mediaId, id));
    for (const link of links) {
      if (await canViewPost(session.user.id, link.postId)) {
        allowed = true;
        break;
      }
    }
  }
  if (!allowed) return new Response(null, { status: 404 });

  try {
    const bytes = await readStoredFile(asset.storageKey);
    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(asset.byteSize),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
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

  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  await deleteStoredFile(asset.storageKey);
  return NextResponse.json({ ok: true });
}
