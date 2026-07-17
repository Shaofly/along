import "server-only";

import type { MediaVariantType } from "@/lib/media/contracts";
import { getMediaVariant, readMediaObject } from "@/lib/media/service";

function downloadName(originalName: string, mimeType: string) {
  const stem = originalName.replace(/\.[^.]+$/, "").slice(0, 200) || "image";
  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : "jpg";
  return `${stem}.${extension}`;
}

export async function mediaResponse(
  mediaId: string,
  variantType: MediaVariantType,
  options: { download?: boolean } = {},
) {
  const resolved = await getMediaVariant(mediaId, variantType);
  if (!resolved || resolved.asset.status !== "ready") {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await readMediaObject(
      resolved.variant.storageKey,
      resolved.legacy,
    );
    const disposition = options.download ? "attachment" : "inline";
    return new Response(bytes, {
      headers: {
        "content-type": resolved.variant.mimeType,
        "content-length": String(resolved.variant.byteSize),
        "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(
          options.download
            ? downloadName(resolved.asset.originalName, resolved.variant.mimeType)
            : resolved.asset.originalName,
        )}`,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "x-media-variant": variantType,
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
