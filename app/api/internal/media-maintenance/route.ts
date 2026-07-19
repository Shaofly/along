import { NextResponse } from "next/server";

import { maintainCircles } from "@/lib/circles";
import { maintainLocalMedia } from "@/lib/media/service";

export async function POST(request: Request) {
  const expected = process.env.MEDIA_MAINTENANCE_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || supplied !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "未授权。" }, { status: 401 });
  }

  const [media, circleLifecycle] = await Promise.all([
    maintainLocalMedia(),
    maintainCircles(),
  ]);
  return NextResponse.json({ media, circleLifecycle });
}
