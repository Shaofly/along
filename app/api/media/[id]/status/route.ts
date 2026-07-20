import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { mediaAssets, mediaVariants } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canAccessMedia } from "@/lib/media/access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: "请先登录。" },
      {
        status: 401,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
  const { id } = await context.params;
  const [asset] = await db
    .select({
      ownerId: mediaAssets.ownerId,
      status: mediaAssets.status,
      failureCode: mediaAssets.failureCode,
      readyAt: mediaAssets.readyAt,
      width: mediaVariants.width,
      height: mediaVariants.height,
      sourceWidth: mediaAssets.sourceWidth,
      sourceHeight: mediaAssets.sourceHeight,
    })
    .from(mediaAssets)
    .leftJoin(
      mediaVariants,
      and(
        eq(mediaVariants.mediaId, mediaAssets.id),
        eq(mediaVariants.variantType, "thumbnail"),
      ),
    )
    .where(eq(mediaAssets.id, id))
    .limit(1);
  if (
    !asset ||
    asset.ownerId !== session.user.id ||
    !(await canAccessMedia(session.user.id, id))
  ) {
    return NextResponse.json(
      { error: "图片不存在。" },
      {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
  return NextResponse.json(
    {
      status: asset.status,
      failureCode: asset.failureCode,
      readyAt: asset.readyAt?.toISOString() ?? null,
      width: asset.width ?? asset.sourceWidth ?? 1,
      height: asset.height ?? asset.sourceHeight ?? 1,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
