import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { deleteStoredFile, saveImage } from "@/lib/storage";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择图片。" }, { status: 400 });
  }

  let stored: Awaited<ReturnType<typeof saveImage>> | null = null;
  try {
    stored = await saveImage(file, session.user.id);
    const id = randomUUID();
    await db.insert(mediaAssets).values({
      id,
      ownerId: session.user.id,
      storageKey: stored.storageKey,
      originalName: file.name.slice(0, 240) || "image",
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
    });
    return NextResponse.json({
      id,
      name: file.name,
      mimeType: stored.mimeType,
      url: `/api/media/${id}`,
    });
  } catch (error) {
    if (stored) await deleteStoredFile(stored.storageKey);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片上传失败。" },
      { status: 400 },
    );
  }
}
