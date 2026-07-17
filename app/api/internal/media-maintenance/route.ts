import { NextResponse } from "next/server";

import { maintainLocalMedia } from "@/lib/media/service";

export async function POST(request: Request) {
  const expected = process.env.MEDIA_MAINTENANCE_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || supplied !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "未授权。" }, { status: 401 });
  }

  return NextResponse.json(await maintainLocalMedia());
}
