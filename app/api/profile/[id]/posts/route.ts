import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getProfilePostsForViewer,
  type ProfileViewMode,
} from "@/lib/content";

const profileViews = new Set<ProfileViewMode>([
  "all",
  "personal",
  "shared",
  "private",
]);

export async function GET(
  request: Request,
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
  const url = new URL(request.url);
  const requestedView = url.searchParams.get("view") ?? "all";
  const view = profileViews.has(requestedView as ProfileViewMode)
    ? requestedView as ProfileViewMode
    : "all";
  const page = await getProfilePostsForViewer(session.user.id, id, {
    cursor: url.searchParams.get("cursor"),
    limit: 12,
    view,
  });
  if (!page) {
    return NextResponse.json(
      { error: "个人主页不存在。" },
      {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
  return NextResponse.json(page, {
    headers: { "cache-control": "private, no-store" },
  });
}
