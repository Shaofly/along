"use client";

/* eslint-disable @next/next/no-img-element -- Private media URLs require the viewer's session cookie. */

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  PointerEvent as ReactPointerEvent,
  TransitionEvent as ReactTransitionEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ViewerPhoto = {
  id: string;
  thumbnailSrc: string;
  src: string;
  hdSrc: string;
  alt: string;
};

type Point = { x: number; y: number };
type GestureMode = "pending" | "horizontal" | "dismiss" | "pan" | "pinch";
type ViewerRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type CloseVisual = {
  from: ViewerRect;
  scale: number;
  src: string;
  x: number;
  y: number;
};

const MOBILE_MIN_SCALE = 1;
const MOBILE_MAX_SCALE = 4;
const DESKTOP_MIN_SCALE = 0.5;
const DESKTOP_MAX_SCALE = 10;
const DESKTOP_FIT_PERCENT = 50;
const SLIDE_DURATION = 280;
const CLOSE_DURATION = 280;

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function rubberScale(value: number, minScale: number, maxScale: number) {
  if (value < minScale) {
    return Math.max(minScale * 0.78, minScale - (minScale - value) * 0.3);
  }
  if (value > maxScale) {
    return Math.min(maxScale * 1.12, maxScale + (value - maxScale) * 0.22);
  }
  return value;
}

function visibleImageRect(image: HTMLImageElement): ViewerRect {
  const box = image.getBoundingClientRect();
  if (!image.naturalWidth || !image.naturalHeight) {
    return { height: box.height, left: box.left, top: box.top, width: box.width };
  }
  const containScale = Math.min(
    box.width / image.naturalWidth,
    box.height / image.naturalHeight,
  );
  const width = image.naturalWidth * containScale;
  const height = image.naturalHeight * containScale;
  return {
    height,
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
  };
}

export function PhotoViewer({
  photos,
  initialIndex,
  author,
  body,
  originRect,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  author: { name: string; image: string | null };
  body: string;
  originRect: DOMRect | null;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [slideX, setSlideX] = useState(0);
  const [slideAnimating, setSlideAnimating] = useState(false);
  const [imageTransitioning, setImageTransitioning] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeVisual, setCloseVisual] = useState<CloseVisual | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState<Record<string, boolean>>({});
  const [hdUrls, setHdUrls] = useState<Record<string, string>>({});
  const [hdReady, setHdReady] = useState<Record<string, boolean>>({});
  const [hdProgress, setHdProgress] = useState<number | null>(null);
  const hdUrlsRef = useRef<Record<string, string>>({});
  const hdRequestRef = useRef<XMLHttpRequest | null>(null);
  const clickGuardCleanupRef = useRef<(() => void) | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    mode: GestureMode;
    start: Point;
    startedAt: number;
    startOffset: Point;
    startScale: number;
    pinchDistance: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const pendingSlideDirection = useRef<-1 | 1 | null>(null);
  const closingRef = useRef(false);
  const closeAfterHistoryRef = useRef(false);
  const closeTimerRef = useRef(0);
  const historyToken = useId();
  const photo = photos[index];
  const photoIdRef = useRef(photo?.id ?? "");
  const originRectRef = useRef(originRect);
  const hdUrl = photo ? hdUrls[photo.id] : undefined;
  const minScale = isMobile ? MOBILE_MIN_SCALE : DESKTOP_MIN_SCALE;
  const maxScale = isMobile ? MOBILE_MAX_SCALE : DESKTOP_MAX_SCALE;

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { photoIdRef.current = photo?.id ?? ""; }, [photo?.id]);
  useEffect(() => { originRectRef.current = originRect; }, [originRect]);
  useEffect(() => {
    hdUrlsRef.current = hdUrls;
  }, [hdUrls]);
  useEffect(() => () => {
    hdRequestRef.current?.abort();
    window.clearTimeout(closeTimerRef.current);
    clickGuardCleanupRef.current?.();
    Object.values(hdUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setScale((current) => Math.max(
        mobile ? MOBILE_MIN_SCALE : DESKTOP_MIN_SCALE,
        Math.min(mobile ? MOBILE_MAX_SCALE : DESKTOP_MAX_SCALE, current),
      ));
      setOffset({ x: 0, y: 0 });
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const guardNextDocumentClick = useCallback(() => {
    clickGuardCleanupRef.current?.();
    let timer = 0;
    const cleanup = () => {
      document.removeEventListener("click", blockClick, true);
      window.clearTimeout(timer);
      if (clickGuardCleanupRef.current === cleanup) clickGuardCleanupRef.current = null;
    };
    const blockClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      cleanup();
    };
    document.addEventListener("click", blockClick, true);
    timer = window.setTimeout(cleanup, 500);
    clickGuardCleanupRef.current = cleanup;
  }, []);

  const finishClose = useCallback((historyAlreadyChanged: boolean) => {
    if (
      !historyAlreadyChanged
      && window.history.state?.photoViewer === historyToken
    ) {
      closeAfterHistoryRef.current = true;
      window.history.back();
      return;
    }
    onClose();
  }, [historyToken, onClose]);

  const animateClose = useCallback((historyAlreadyChanged = false) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    hdRequestRef.current?.abort();
    setSheetOpen(false);
    setImageTransitioning(true);
    setOffset({ x: 0, y: 0 });
    setScale(1);
    setBackdropOpacity(0);

    const currentImage = stageRef.current?.querySelector<HTMLImageElement>(
      ".photo-viewer-slide.is-current .photo-viewer-hd-image.is-ready,"
      + ".photo-viewer-slide.is-current .photo-viewer-preview.is-ready,"
      + ".photo-viewer-slide.is-current .photo-viewer-placeholder",
    );
    const currentOrigin = document.querySelector<HTMLElement>(
      `[data-photo-origin="${photoIdRef.current}"]`,
    );
    const targetRect = currentOrigin?.getBoundingClientRect() ?? originRectRef.current;
    if (currentImage && targetRect && !reducedMotion) {
      const from = visibleImageRect(currentImage);
      setCloseVisual({
        from,
        scale: Math.max(
          0.04,
          Math.min(targetRect.width / from.width, targetRect.height / from.height),
        ),
        src: currentImage.currentSrc || currentImage.src,
        x: targetRect.left + targetRect.width / 2 - (from.left + from.width / 2),
        y: targetRect.top + targetRect.height / 2 - (from.top + from.height / 2),
      });
    }

    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(
      () => finishClose(historyAlreadyChanged),
      reducedMotion ? 0 : CLOSE_DURATION,
    );
  }, [finishClose, reducedMotion]);

  const closeFromHistory = useCallback(() => {
    if (closeAfterHistoryRef.current) {
      closeAfterHistoryRef.current = false;
      onClose();
      return;
    }
    animateClose(true);
  }, [animateClose, onClose]);

  const requestClose = useCallback(() => {
    animateClose(false);
  }, [animateClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.history.pushState({ ...window.history.state, photoViewer: historyToken }, "", window.location.href);
    window.addEventListener("popstate", closeFromHistory);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", closeFromHistory);
    };
  }, [closeFromHistory, historyToken]);

  const resetImage = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setBackdropOpacity(1);
  }, []);

  const finishSlideImmediately = useCallback((direction: -1 | 1) => {
    hdRequestRef.current?.abort();
    hdRequestRef.current = null;
    setHdProgress(null);
    setIndex((current) => (current + direction + photos.length) % photos.length);
    setSlideX(0);
    setSlideAnimating(false);
    pendingSlideDirection.current = null;
    resetImage();
  }, [photos.length, resetImage]);

  const movePhoto = useCallback((direction: -1 | 1) => {
    if (photos.length < 2 || slideAnimating || pendingSlideDirection.current) return;
    if (reducedMotion) {
      finishSlideImmediately(direction);
      return;
    }
    const width = stageRef.current?.clientWidth ?? window.innerWidth;
    pendingSlideDirection.current = direction;
    setSlideAnimating(true);
    setSlideX(-direction * width);
  }, [finishSlideImmediately, photos.length, reducedMotion, slideAnimating]);

  function onTrackTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>) {
    if (event.currentTarget !== event.target || event.propertyName !== "transform") return;
    const direction = pendingSlideDirection.current;
    if (direction) finishSlideImmediately(direction);
    else setSlideAnimating(false);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
      if (event.key === "ArrowLeft") movePhoto(-1);
      if (event.key === "ArrowRight") movePhoto(1);
      if (event.key === "+" || event.key === "=") {
        setScale((current) => Math.min(maxScale, current + 0.5));
      }
      if (event.key === "-") {
        setScale((current) => Math.max(minScale, current - 0.5));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maxScale, minScale, movePhoto, requestClose]);

  const clampPan = useCallback((point: Point, currentScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return point;
    const boundX = rect.width * (currentScale - 1) * 0.5;
    const boundY = rect.height * (currentScale - 1) * 0.5;
    return {
      x: Math.max(-boundX, Math.min(boundX, point.x)),
      y: Math.max(-boundY, Math.min(boundY, point.y)),
    };
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button, a, [data-viewer-control]")) return;
    if (pendingSlideDirection.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointers.current.values()];
    if (points.length === 2) {
      gesture.current = {
        mode: "pinch",
        start: points[0],
        startedAt: performance.now(),
        startOffset: offsetRef.current,
        startScale: scaleRef.current,
        pinchDistance: distance(points[0], points[1]),
      };
      setImageTransitioning(false);
      return;
    }

    gesture.current = {
      mode: scaleRef.current > 1.001 ? "pan" : "pending",
      start: points[0],
      startedAt: performance.now(),
      startOffset: offsetRef.current,
      startScale: scaleRef.current,
      pinchDistance: 0,
    };
    setImageTransitioning(false);
    setSlideAnimating(false);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];

    if (points.length >= 2 && gesture.current.mode === "pinch") {
      const ratio = distance(points[0], points[1]) / Math.max(1, gesture.current.pinchDistance);
      setScale(rubberScale(
        gesture.current.startScale * ratio,
        minScale,
        maxScale,
      ));
      return;
    }

    const current = points[0];
    const dx = current.x - gesture.current.start.x;
    const dy = current.y - gesture.current.start.y;
    if (gesture.current.mode === "pending" && Math.hypot(dx, dy) > 8) {
      gesture.current.mode = Math.abs(dx) > Math.abs(dy) * 1.15 ? "horizontal" : "dismiss";
    }

    if (gesture.current.mode === "pan") {
      setOffset(clampPan({
        x: gesture.current.startOffset.x + dx,
        y: gesture.current.startOffset.y + dy,
      }, scaleRef.current));
    } else if (gesture.current.mode === "horizontal" && photos.length > 1) {
      setSlideX(dx);
    } else if (gesture.current.mode === "dismiss") {
      const progress = Math.min(1, Math.abs(dy) / Math.max(220, window.innerHeight * 0.42));
      setOffset({ x: dx * 0.16, y: dy });
      setScale(1 - progress * 0.18);
      setBackdropOpacity(1 - progress * 0.72);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const activeGesture = gesture.current;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.delete(event.pointerId);
    if (!activeGesture) return;

    if (pointers.current.size > 0) {
      const remaining = [...pointers.current.values()][0];
      gesture.current = {
        mode: scaleRef.current > 1.001 ? "pan" : "pending",
        start: remaining,
        startedAt: performance.now(),
        startOffset: offsetRef.current,
        startScale: scaleRef.current,
        pinchDistance: 0,
      };
      return;
    }

    const dx = point.x - activeGesture.start.x;
    const dy = point.y - activeGesture.start.y;
    const elapsed = Math.max(1, performance.now() - activeGesture.startedAt);
    const velocityX = dx / elapsed;
    const velocityY = dy / elapsed;

    if (activeGesture.mode === "pinch") {
      const snappedScale = Math.max(
        minScale,
        Math.min(maxScale, scaleRef.current),
      );
      setImageTransitioning(true);
      setScale(snappedScale);
      if (snappedScale === 1) setOffset({ x: 0, y: 0 });
    } else if (activeGesture.mode === "horizontal" && photos.length > 1) {
      const direction = dx < 0 ? 1 : -1;
      if (Math.abs(dx) > 64 || Math.abs(velocityX) > 0.45) {
        const width = stageRef.current?.clientWidth ?? window.innerWidth;
        pendingSlideDirection.current = direction;
        setSlideAnimating(true);
        setSlideX(-direction * width);
      } else {
        pendingSlideDirection.current = null;
        setSlideAnimating(true);
        setSlideX(0);
      }
    } else if (activeGesture.mode === "dismiss") {
      setImageTransitioning(true);
      if (Math.abs(dy) > 92 || Math.abs(velocityY) > 0.55) {
        event.preventDefault();
        event.stopPropagation();
        guardNextDocumentClick();
        animateClose(false);
      } else {
        resetImage();
      }
    } else if (activeGesture.mode === "pending" && Math.hypot(dx, dy) < 7 && elapsed < 360) {
      const isMobile = window.matchMedia("(max-width: 700px)").matches;
      const clickedOutsideStage = !(event.target as Element).closest(".photo-viewer-stage-wrap");
      if (isMobile || clickedOutsideStage) {
        event.preventDefault();
        event.stopPropagation();
        guardNextDocumentClick();
        requestClose();
      }
    }

    gesture.current = null;
    window.setTimeout(() => setImageTransitioning(false), reducedMotion ? 0 : SLIDE_DURATION);
  }

  function zoomBy(amount: number) {
    setImageTransitioning(true);
    setScale((current) => {
      const next = Math.max(minScale, Math.min(maxScale, current + amount));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
    window.setTimeout(() => setImageTransitioning(false), reducedMotion ? 0 : 220);
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!slideAnimating) zoomBy(event.deltaY < 0 ? 0.12 : -0.12);
  }

  function loadHd() {
    if (!photo || hdUrls[photo.id] || hdProgress !== null) return;
    const request = new XMLHttpRequest();
    hdRequestRef.current = request;
    setHdProgress(0);
    request.open("GET", photo.hdSrc);
    request.responseType = "blob";
    request.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      setHdProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      if (hdRequestRef.current !== request) return;
      hdRequestRef.current = null;
      if (request.status < 200 || request.status >= 300 || !(request.response instanceof Blob)) {
        setHdProgress(null);
        return;
      }
      const url = URL.createObjectURL(request.response);
      setHdUrls((current) => ({ ...current, [photo.id]: url }));
      setHdProgress(null);
    });
    request.addEventListener("error", () => {
      if (hdRequestRef.current !== request) return;
      hdRequestRef.current = null;
      setHdProgress(null);
    });
    request.addEventListener("abort", () => {
      if (hdRequestRef.current === request) hdRequestRef.current = null;
    });
    request.send();
  }

  const entrance = useMemo(() => {
    if (!originRect || typeof window === "undefined" || reducedMotion) return { x: 0, y: 0, scale: 1 };
    const x = originRect.left + originRect.width / 2 - window.innerWidth / 2;
    const y = originRect.top + originRect.height / 2 - window.innerHeight / 2;
    return { x, y, scale: Math.max(0.18, Math.min(0.72, originRect.width / window.innerWidth)) };
  }, [originRect, reducedMotion]);

  const visiblePhotos = useMemo(() => {
    if (photos.length === 1) return [{ position: 0, photo: photos[0] }];
    return ([-1, 0, 1] as const).map((position) => ({
      position,
      photo: photos[(index + position + photos.length) % photos.length],
    }));
  }, [index, photos]);

  if (typeof document === "undefined" || !photo) return null;

  return createPortal(
    <motion.div
      animate={{ backgroundColor: `rgba(24, 28, 26, ${0.78 * backdropOpacity})` }}
      aria-label="照片查看器"
      aria-modal="true"
      className={`photo-viewer${isClosing ? " is-closing" : ""}`}
      initial={{ backgroundColor: "rgba(24, 28, 26, 0)" }}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      role="dialog"
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
    >
      <header className="photo-viewer-mobile-header" data-viewer-control>
        <span className="photo-viewer-count">{index + 1} / {photos.length}</span>
        <span className="photo-viewer-author">
          <span className="photo-viewer-avatar">
            {author.image ? <img alt="" src={author.image} /> : author.name.slice(0, 1)}
          </span>
          <strong>{author.name}</strong>
        </span>
        <button aria-label="更多照片操作" onClick={() => setSheetOpen(true)} type="button">
          <MoreHorizontal aria-hidden="true" />
        </button>
      </header>

      <div className="photo-viewer-shell">
        <motion.div
          animate={{
            opacity: isClosing ? 0 : 1,
            scale: 1,
            x: 0,
            y: 0,
          }}
          className={`photo-viewer-stage-wrap${imageTransitioning ? " is-image-transitioning" : ""}`}
          initial={{ opacity: reducedMotion ? 1 : 0.45, ...entrance }}
          ref={stageRef}
          style={{ backgroundColor: `rgba(15, 19, 17, ${0.72 * backdropOpacity})` }}
          transition={{
            duration: reducedMotion ? 0 : isClosing ? 0.08 : 0.32,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div
            className={`photo-viewer-track${photos.length === 1 ? " is-single" : ""}${slideAnimating ? " is-animating" : ""}`}
            onTransitionEnd={onTrackTransitionEnd}
            style={{
              transform: photos.length > 1
                ? `translate3d(calc(-33.333333% + ${slideX}px), 0, 0)`
                : "translate3d(0, 0, 0)",
            }}
          >
            {visiblePhotos.map(({ position, photo: visiblePhoto }) => (
              <div
                className={`photo-viewer-slide${position === 0 ? " is-current" : ""}`}
                key={`${visiblePhoto.id}-${position}`}
              >
                <div
                  className="photo-viewer-image-stack"
                  style={position === 0
                    ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }
                    : undefined}
                >
                  <img
                    alt=""
                    aria-hidden="true"
                    className="photo-viewer-placeholder"
                    draggable={false}
                    src={visiblePhoto.thumbnailSrc}
                  />
                  <img
                    alt={visiblePhoto.alt}
                    className={`photo-viewer-preview${previewReady[visiblePhoto.id] ? " is-ready" : ""}`}
                    draggable={false}
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      void image.decode().catch(() => undefined).finally(() => {
                        setPreviewReady((current) => ({ ...current, [visiblePhoto.id]: true }));
                      });
                    }}
                    src={visiblePhoto.src}
                  />
                  {position === 0 && hdUrls[visiblePhoto.id] ? (
                    <img
                      alt={visiblePhoto.alt}
                      className={`photo-viewer-hd-image${hdReady[visiblePhoto.id] ? " is-ready" : ""}`}
                      draggable={false}
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        void image.decode().catch(() => undefined).finally(() => {
                          setHdReady((current) => ({ ...current, [visiblePhoto.id]: true }));
                        });
                      }}
                      src={hdUrls[visiblePhoto.id]}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {photos.length > 1 ? (
          <>
            <button className="photo-viewer-arrow is-left" aria-label="上一张" onClick={() => movePhoto(-1)} type="button">
              <ChevronLeft aria-hidden="true" />
            </button>
            <button className="photo-viewer-arrow is-right" aria-label="下一张" onClick={() => movePhoto(1)} type="button">
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        ) : null}

        <div className="photo-viewer-desktop-actions" data-viewer-control>
          <a aria-label="下载图片" download={photo.alt} href={`${photo.hdSrc}?download=1`}><Download aria-hidden="true" /></a>
          <button aria-label="关闭照片查看器" onClick={requestClose} type="button"><X aria-hidden="true" /></button>
        </div>
        <div className="photo-viewer-zoom" aria-label="照片缩放控制" data-viewer-control>
          <button aria-label="缩小" disabled={scale <= minScale} onClick={() => zoomBy(-0.5)} type="button"><Minus aria-hidden="true" /></button>
          <span>{Math.round(scale * DESKTOP_FIT_PERCENT)}%</span>
          <button aria-label="放大" disabled={scale >= maxScale} onClick={() => zoomBy(0.5)} type="button"><Plus aria-hidden="true" /></button>
        </div>
        {body ? <p className={`photo-viewer-caption${scale > 1.02 ? " is-hidden" : ""}`}>{body}</p> : null}
        {!hdUrl ? (
          <button
            className="photo-viewer-hd"
            data-viewer-control
            disabled={hdProgress !== null}
            onClick={loadHd}
            type="button"
          >
            {hdProgress === null ? "查看原图" : `正在加载原图 ${hdProgress}%`}
          </button>
        ) : null}
        {hdProgress !== null ? (
          <div className="photo-viewer-hd-progress" data-viewer-control>
            <span
              aria-label={`原图加载进度 ${hdProgress}%`}
              style={{ background: `conic-gradient(#f4f0e7 ${hdProgress * 3.6}deg, rgba(244, 240, 231, 0.2) 0deg)` }}
            />
            <strong>{hdProgress}%</strong>
          </div>
        ) : null}
      </div>

      {closeVisual ? (
        <motion.div
          animate={{
            opacity: [1, 1, 0],
            scale: closeVisual.scale,
            x: closeVisual.x,
            y: closeVisual.y,
          }}
          className="photo-viewer-close-visual"
          initial={{
            height: closeVisual.from.height,
            left: closeVisual.from.left,
            opacity: 1,
            scale: 1,
            top: closeVisual.from.top,
            width: closeVisual.from.width,
            x: 0,
            y: 0,
          }}
          transition={{
            duration: reducedMotion ? 0 : CLOSE_DURATION / 1000,
            ease: [0.22, 1, 0.36, 1],
            opacity: { times: [0, 0.74, 1] },
          }}
        >
          <img alt="" aria-hidden="true" draggable={false} src={closeVisual.src} />
        </motion.div>
      ) : null}

      <AnimatePresence>
        {sheetOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="photo-viewer-sheet-backdrop"
            data-viewer-control
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              className="photo-viewer-sheet"
              exit={{ filter: "blur(2px)", opacity: 0, y: "50%" }}
              initial={{ filter: "blur(2px)", opacity: 0, y: "50%" }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: reducedMotion ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
            >
              {!hdUrl ? <button onClick={loadHd} type="button">查看原图</button> : null}
              <a download={photo.alt} href={`${photo.hdSrc}?download=1`}><Download aria-hidden="true" /><span>下载原图</span></a>
              <button onClick={() => setSheetOpen(false)} type="button">取消</button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
