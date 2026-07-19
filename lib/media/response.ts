import "server-only";

import { createHash } from "node:crypto";

import type { MediaVariantType } from "@/lib/media/contracts";
import { getMediaVariant, readMediaObject } from "@/lib/media/service";

const protectedMediaCacheControl =
  "private, no-cache, max-age=0, must-revalidate";

function downloadName(originalName: string, mimeType: string) {
  const stem = originalName.replace(/\.[^.]+$/, "").slice(0, 200) || "image";
  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : "jpg";
  return `${stem}.${extension}`;
}

function mediaEtag(value: string | null, storageKey: string, byteSize: number) {
  const opaque =
    value
      ?.trim()
      .replace(/^W\//, "")
      .replace(/^"+|"+$/g, "") ||
    createHash("sha256")
      .update(`${storageKey}:${byteSize}`)
      .digest("hex");
  return `"${opaque.replaceAll("\\", "").replaceAll('"', "")}"`;
}

function etagMatches(ifNoneMatch: string | null | undefined, etag: string) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === etag;
  });
}

export async function mediaResponse(
  mediaId: string,
  variantType: MediaVariantType,
  options: { download?: boolean; ifNoneMatch?: string | null } = {},
) {
  const resolved = await getMediaVariant(mediaId, variantType);
  if (!resolved || resolved.asset.status !== "ready") {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const etag = mediaEtag(
    resolved.variant.etag,
    resolved.variant.storageKey,
    resolved.variant.byteSize,
  );
  const disposition = options.download ? "attachment" : "inline";
  const responseHeaders = {
    "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(
      options.download
        ? downloadName(resolved.asset.originalName, resolved.variant.mimeType)
        : resolved.asset.originalName,
    )}`,
    "cache-control": protectedMediaCacheControl,
    etag,
    "x-content-type-options": "nosniff",
    "x-media-variant": variantType,
  };
  if (etagMatches(options.ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }

  try {
    const bytes = await readMediaObject(
      resolved.variant.storageKey,
      resolved.legacy,
    );
    return new Response(bytes, {
      headers: {
        ...responseHeaders,
        "content-type": resolved.variant.mimeType,
        "content-length": String(resolved.variant.byteSize),
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
