"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated media and object URLs are not Next Image candidates. */

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import { PhotoMosaic } from "@/app/components/PhotoMosaic";
import type { PhotoLayoutSpec } from "@/lib/photo-layout";

export type ComposerPhoto = {
  key: string;
  id?: string;
  file?: File;
  originalName: string;
  mimeType: string;
  src: string;
  width: number;
  height: number;
};

export async function createComposerPhoto(file: File): Promise<ComposerPhoto> {
  const src = URL.createObjectURL(file);
  let width = 1;
  let height = 1;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    await new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        width = image.naturalWidth || 1;
        height = image.naturalHeight || 1;
        resolve();
      };
      image.onerror = () => resolve();
      image.src = src;
    });
  }
  return {
    key: `local:${crypto.randomUUID()}`,
    file,
    originalName: file.name,
    mimeType: file.type,
    src,
    width,
    height,
  };
}

export function ComposerPhotoBoard({
  layout,
  onCycleLayout,
  onMove,
  onRemove,
  orderHint = "拖动图片调整先后",
  photos,
}: {
  layout: PhotoLayoutSpec | null;
  onCycleLayout: () => void;
  onMove: (from: number, to: number) => void;
  onRemove?: (index: number) => void;
  orderHint?: string;
  photos: ComposerPhoto[];
}) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draggingKey) return;
    const finish = () => setDraggingKey(null);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggingKey]);

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= photos.length) return;
    onMove(from, to);
    setAnnouncement(`已将第 ${from + 1} 张图片移到第 ${to + 1} 位`);
  }

  return (
    <section className="composer-photo-board" aria-label="照片排布">
      <div className="composer-photo-order">
        <div className="composer-photo-section-heading">
          <div>
            <strong>调整顺序</strong>
            <span>{orderHint}</span>
          </div>
          <span>{photos.length} / 20</span>
        </div>
        <div className="composer-photo-thumbnails" ref={boardRef}>
          {photos.map((photo, index) => (
            <figure
              aria-label={`第 ${index + 1} 张，${photo.originalName}`}
              aria-roledescription="可排序图片"
              className={draggingKey === photo.key ? "is-dragging" : ""}
              data-composer-photo-key={photo.key}
              key={photo.key}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, index - 1);
                }
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, index + 1);
                }
              }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggingKey(photo.key);
              }}
              onPointerMove={(event) => {
                if (draggingKey !== photo.key) return;
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-composer-photo-key]");
                const targetIndex = photos.findIndex(
                  (item) => item.key === target?.dataset.composerPhotoKey,
                );
                if (targetIndex >= 0) move(index, targetIndex);
              }}
              tabIndex={0}
            >
              <img alt="" src={photo.src} />
              <span className="composer-photo-index">{index + 1}</span>
              {onRemove ? (
                <button
                  aria-label={`移除图片 ${photo.originalName}`}
                  className="remove-preview"
                  onClick={() => onRemove(index)}
                  type="button"
                >
                  <X aria-hidden="true" size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </figure>
          ))}
        </div>
      </div>
      <div className="composer-photo-final">
        <div className="composer-photo-section-heading">
          <div>
            <strong>发布效果</strong>
          </div>
          <button onClick={onCycleLayout} type="button">
            <RefreshCw aria-hidden="true" size={13} strokeWidth={2} />
            换个排法
          </button>
        </div>
        <PhotoMosaic
          className="composer-photo-mosaic"
          layout={layout}
          maxHeight={360}
          photos={photos.map((photo) => ({
            key: photo.key,
            src: photo.src,
            alt: photo.originalName,
            width: photo.width,
            height: photo.height,
          }))}
        />
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
