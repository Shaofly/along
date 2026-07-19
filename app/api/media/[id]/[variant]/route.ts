import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { canAccessMedia } from "@/lib/media/access";
import type { MediaVariantType } from "@/lib/media/contracts";
import { MEDIA_VARIANTS } from "@/lib/media/contracts";
import { mediaResponse } from "@/lib/media/response";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; variant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response(null, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const { id, variant } = await context.params;
  if (!MEDIA_VARIANTS.includes(variant as MediaVariantType)) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (!(await canAccessMedia(session.user.id, id))) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  return mediaResponse(id, variant as MediaVariantType, {
    download,
    ifNoneMatch: request.headers.get("if-none-match"),
  });
}
