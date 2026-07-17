import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  const { id } = await context.params;
  const [asset] = await db
    .select({
      ownerId: mediaAssets.ownerId,
      status: mediaAssets.status,
      failureCode: mediaAssets.failureCode,
      readyAt: mediaAssets.readyAt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  if (!asset || asset.ownerId !== session.user.id) {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }
  return NextResponse.json({
    status: asset.status,
    failureCode: asset.failureCode,
    readyAt: asset.readyAt?.toISOString() ?? null,
  });
}

