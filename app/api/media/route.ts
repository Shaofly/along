import { headers } from "next/headers";
import { after, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createLocalUpload, processLocalMedia } from "@/lib/media/service";

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

  try {
    const media = await createLocalUpload(file, session.user.id);
    after(() => processLocalMedia(media.id));
    return NextResponse.json({
      id: media.id,
      name: media.originalName,
      mimeType: media.mimeType,
      status: media.status,
      urls: {
        thumbnail: `/api/media/${media.id}/thumbnail`,
        preview: `/api/media/${media.id}/preview`,
        hd: `/api/media/${media.id}/hd`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片上传失败。" },
      { status: 400 },
    );
  }
}
