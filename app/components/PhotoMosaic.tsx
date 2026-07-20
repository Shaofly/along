"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated media and object URLs are not Next Image candidates. */

import { useEffect, useRef, useState } from "react";

import {
  computePhotoLayout,
  normalizePhotoLayout,
  PHOTO_LAYOUT_VISIBLE_LIMIT,
  type PhotoLayoutSpec,
} from "@/lib/photo-layout";

export type MosaicPhoto = {
  key: string;
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function PhotoMosaic({
  className = "",
  interactive = false,
  layout,
  maxHeight,
  onPhotoClick,
  photos,
}: {
  className?: string;
  interactive?: boolean;
  layout: PhotoLayoutSpec | null;
  maxHeight?: number;
  onPhotoClick?: (index: number, element: HTMLButtonElement) => void;
  photos: MosaicPhoto[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const visiblePhotos = photos.slice(0, PHOTO_LAYOUT_VISIBLE_LIMIT);
  const ratios = visiblePhotos.map((photo) => photo.width / photo.height);
  const resolvedLayout = normalizePhotoLayout(layout, ratios);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setAvailableWidth(host.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const geometry = (() => {
    if (!resolvedLayout || !availableWidth) return null;
    const gap = availableWidth < 420 ? 6 : 8;
    let width = availableWidth;
    let result = computePhotoLayout(resolvedLayout, ratios, width, gap);
    if (maxHeight && result.height > maxHeight) {
      let low = Math.min(
        Math.max(24, gap * Math.max(0, visiblePhotos.length - 1) + 1),
        availableWidth,
      );
      let high = availableWidth;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const middle = (low + high) / 2;
        const sample = computePhotoLayout(resolvedLayout, ratios, middle, gap);
        if (sample.height > maxHeight) high = middle;
        else low = middle;
      }
      width = low;
      result = computePhotoLayout(resolvedLayout, ratios, width, gap);
    }
    return result;
  })();

  return (
    <div
      className={`photo-mosaic-host ${className}`.trim()}
      ref={hostRef}
      style={{ height: geometry?.height ?? 0 }}
    >
      {geometry
        ? visiblePhotos.map((photo, index) => {
            const rect = geometry.rects[index];
            if (!rect) return null;
            const isStack = index === 8 && photos.length > PHOTO_LAYOUT_VISIBLE_LIMIT;
            return (
              <button
                aria-label={
                  isStack
                    ? `查看第 9 张图片及其余 ${photos.length - PHOTO_LAYOUT_VISIBLE_LIMIT} 张`
                    : `查看第 ${index + 1} 张图片：${photo.alt}`
                }
                className={`photo-mosaic-tile${isStack ? " photo-mosaic-stack" : ""}`}
                data-photo-origin={interactive ? photo.key : undefined}
                key={photo.key}
                onClick={(event) => {
                  if (interactive) onPhotoClick?.(index, event.currentTarget);
                }}
                style={{
                  height: rect.height,
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                }}
                tabIndex={interactive ? 0 : -1}
                type="button"
              >
                {isStack && photos[10] ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="photo-mosaic-stack-back photo-mosaic-stack-back--far"
                    src={photos[10].src}
                  />
                ) : null}
                {isStack && photos[9] ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="photo-mosaic-stack-back photo-mosaic-stack-back--near"
                    src={photos[9].src}
                  />
                ) : null}
                <img alt={photo.alt} className="photo-mosaic-image" src={photo.src} />
                {isStack ? (
                  <span className="photo-mosaic-more">
                    +{photos.length - PHOTO_LAYOUT_VISIBLE_LIMIT}
                  </span>
                ) : null}
              </button>
            );
          })
        : null}
    </div>
  );
}
