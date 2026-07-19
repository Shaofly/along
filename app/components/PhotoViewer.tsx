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

type ImageMorphVisual = {
  from: ViewerRect;
  fromRadius: number;
  src: string;
  to: ViewerRect;
  toRadius: number;
};

const MOBILE_MIN_SCALE = 1;
const MOBILE_MAX_SCALE = 4;
const DESKTOP_MIN_SCALE = 0.5;
const DESKTOP_MAX_SCALE = 10;
const DESKTOP_FIT_PERCENT = 50;
const SLIDE_DURATION = 280;
const CLOSE_DURATION = 280;
const REDUCED_MOTION_CLOSE_SETTLE_DURATION = 32;
const HORIZONTAL_GESTURE_RATIO = 1.6;
const DISMISS_DISTANCE = 104;
const DISMISS_VELOCITY = 0.55;
const DISMISS_MIN_TRAVEL = 220;
const DISMISS_SCALE_REDUCTION = 0.24;
const DISMISS_BACKDROP_REDUCTION = 0.88;
const DESKTOP_STAGE_INSET_RATIO = 0.065;
const DESKTOP_STAGE_INSET_MIN = 36;
const DESKTOP_STAGE_INSET_MAX = 52;

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

function isHorizontalGesture(dx: number, dy: number) {
  return Math.abs(dx) > Math.abs(dy) * HORIZONTAL_GESTURE_RATIO;
}

function dismissVisual(dx: number, dy: number) {
  const dragDistance = Math.hypot(dx, dy);
  const viewportDistance = Math.min(window.innerWidth, window.innerHeight) * 0.52;
  const progress = Math.min(1, dragDistance / Math.max(DISMISS_MIN_TRAVEL, viewportDistance));
  return {
    backdropOpacity: 1 - progress * DISMISS_BACKDROP_REDUCTION,
    offset: { x: dx, y: dy },
    scale: 1 - progress * DISMISS_SCALE_REDUCTION,
  };
}

function shouldDismiss(dx: number, dy: number, elapsed: number) {
  const dragDistance = Math.hypot(dx, dy);
  const dragVelocity = dragDistance / Math.max(1, elapsed);
  return dragDistance > DISMISS_DISTANCE || dragVelocity > DISMISS_VELOCITY;
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

function viewerImageRect(source: ViewerRect | null) {
  if (!source || typeof window === "undefined") return null;

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const shellWidth = mobile
    ? window.innerWidth
    : Math.min(window.innerWidth * 0.76, 1080);
  const shellHeight = mobile
    ? window.innerHeight
    : Math.min(window.innerHeight * 0.74, 760);
  const trackInset = mobile
    ? 0
    : Math.max(
      DESKTOP_STAGE_INSET_MIN,
      Math.min(shellHeight * DESKTOP_STAGE_INSET_RATIO, DESKTOP_STAGE_INSET_MAX),
    );
  const availableWidth = Math.max(1, shellWidth - trackInset * 2);
  const availableHeight = Math.max(1, shellHeight - trackInset * 2);
  const fit = Math.min(
    availableWidth / Math.max(1, source.width),
    availableHeight / Math.max(1, source.height),
  );
  const targetWidth = source.width * fit;
  const targetHeight = source.height * fit;

  return {
    height: targetHeight,
    left: (window.innerWidth - targetWidth) / 2,
    top: (window.innerHeight - targetHeight) / 2,
    width: targetWidth,
  };
}

function elementRadius(element: HTMLElement | null, fallback: number) {
  if (!element) return fallback;
  const radius = Number.parseFloat(
    window.getComputedStyle(element).borderTopLeftRadius,
  );
  return Number.isFinite(radius) ? radius : fallback;
}

export function PhotoViewer({
  photos,
  initialIndex,
  author,
  body,
  originRect,
  originRadius,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  author: { name: string; image: string | null };
  body: string;
  originRect: DOMRect | null;
  originRadius: number;
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
  const [isDismissing, setIsDismissing] = useState(false);
  const [entranceComplete, setEntranceComplete] = useState(
    Boolean(reducedMotion || !originRect),
  );
  const [closeVisual, setCloseVisual] = useState<ImageMorphVisual | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState<Record<string, boolean>>({});
  const [hdUrls, setHdUrls] = useState<Record<string, string>>({});
  const [hdReady, setHdReady] = useState<Record<string, boolean>>({});
  const [hdProgress, setHdProgress] = useState<number | null>(null);
  const hdUrlsRef = useRef<Record<string, string>>({});
  const hdRequestRef = useRef<XMLHttpRequest | null>(null);
  const dismissResetTimerRef = useRef(0);
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
  const trackViewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const pendingSlideDirection = useRef<-1 | 1 | null>(null);
  const closingRef = useRef(false);
  const closeAfterHistoryRef = useRef(false);
  const closeTimerRef = useRef(0);
  const closeCompletedRef = useRef(false);
  const historyToken = useId();
  const photo = photos[index];
  const photoIdRef = useRef(photo?.id ?? "");
  const originRectRef = useRef(originRect);
  const originRadiusRef = useRef(originRadius);
  const hdUrl = photo ? hdUrls[photo.id] : undefined;
  const minScale = isMobile ? MOBILE_MIN_SCALE : DESKTOP_MIN_SCALE;
  const maxScale = isMobile ? MOBILE_MAX_SCALE : DESKTOP_MAX_SCALE;

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { photoIdRef.current = photo?.id ?? ""; }, [photo?.id]);
  useEffect(() => { originRectRef.current = originRect; }, [originRect]);
  useEffect(() => { originRadiusRef.current = originRadius; }, [originRadius]);
  useEffect(() => {
    hdUrlsRef.current = hdUrls;
  }, [hdUrls]);
  useEffect(() => () => {
    hdRequestRef.current?.abort();
    window.clearTimeout(closeTimerRef.current);
    window.clearTimeout(dismissResetTimerRef.current);
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

  const completeClose = useCallback(() => {
    if (closeCompletedRef.current) return;
    closeCompletedRef.current = true;
    onClose();
  }, [onClose]);

  const finishClose = useCallback((historyAlreadyChanged: boolean) => {
    if (
      !historyAlreadyChanged
      && window.history.state?.photoViewer === historyToken
    ) {
      closeAfterHistoryRef.current = true;
      window.history.back();
      completeClose();
      return;
    }
    completeClose();
  }, [completeClose, historyToken]);

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
    const targetElement = currentOrigin?.querySelector<HTMLElement>("img") ?? currentOrigin;
    const targetRect = targetElement?.getBoundingClientRect() ?? originRectRef.current;
    if (currentImage && targetRect && !reducedMotion) {
      const from = visibleImageRect(currentImage);
      setCloseVisual({
        from,
        fromRadius: elementRadius(currentImage, 0),
        src: currentImage.currentSrc || currentImage.src,
        to: {
          height: targetRect.height,
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
        },
        toRadius: elementRadius(targetElement, originRadiusRef.current),
      });
    }

    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(
      () => finishClose(historyAlreadyChanged),
      reducedMotion ? REDUCED_MOTION_CLOSE_SETTLE_DURATION : CLOSE_DURATION,
    );
  }, [finishClose, reducedMotion]);

  const closeFromHistory = useCallback(() => {
    if (closeAfterHistoryRef.current) {
      closeAfterHistoryRef.current = false;
      completeClose();
      return;
    }
    animateClose(true);
  }, [animateClose, completeClose]);

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
    window.clearTimeout(dismissResetTimerRef.current);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setBackdropOpacity(1);
    setIsDismissing(false);
  }, []);

  const reboundDismiss = useCallback(() => {
    window.clearTimeout(dismissResetTimerRef.current);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setBackdropOpacity(1);
    dismissResetTimerRef.current = window.setTimeout(
      () => setIsDismissing(false),
      reducedMotion ? 0 : SLIDE_DURATION,
    );
  }, [reducedMotion]);

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
    const width = trackViewportRef.current?.clientWidth ?? window.innerWidth;
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
    const rect = trackViewportRef.current?.getBoundingClientRect();
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
    window.clearTimeout(dismissResetTimerRef.current);
    setIsDismissing(false);
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
      const horizontal = photos.length > 1 && isHorizontalGesture(dx, dy);
      gesture.current.mode = horizontal ? "horizontal" : "dismiss";
      if (!horizontal) setIsDismissing(true);
    }

    if (gesture.current.mode === "pan") {
      setOffset(clampPan({
        x: gesture.current.startOffset.x + dx,
        y: gesture.current.startOffset.y + dy,
      }, scaleRef.current));
    } else if (gesture.current.mode === "horizontal" && photos.length > 1) {
      setSlideX(dx);
    } else if (gesture.current.mode === "dismiss") {
      const visual = dismissVisual(dx, dy);
      setOffset(visual.offset);
      setScale(visual.scale);
      setBackdropOpacity(visual.backdropOpacity);
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
        const width = trackViewportRef.current?.clientWidth ?? window.innerWidth;
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
      if (shouldDismiss(dx, dy, elapsed)) {
        event.preventDefault();
        event.stopPropagation();
        animateClose(false);
      } else {
        reboundDismiss();
      }
    } else if (activeGesture.mode === "pending" && Math.hypot(dx, dy) < 7 && elapsed < 360) {
      const isMobile = window.matchMedia("(max-width: 700px)").matches;
      const clickedOutsideStage = !(event.target as Element).closest(".photo-viewer-stage-wrap");
      if (isMobile || clickedOutsideStage) {
        event.preventDefault();
        event.stopPropagation();
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

  const openingVisual = useMemo<ImageMorphVisual | null>(() => {
    if (!photo || !originRect || reducedMotion) return null;
    const to = viewerImageRect(originRect);
    if (!to) return null;
    return {
      from: {
        height: originRect.height,
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
      },
      fromRadius: originRadius,
      src: photo.thumbnailSrc,
      to,
      toRadius: 0,
    };
  }, [originRadius, originRect, photo, reducedMotion]);
  const entranceFinished = entranceComplete || Boolean(reducedMotion);

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
      className={`photo-viewer${isClosing ? " is-closing" : ""}${isDismissing ? " is-dismissing" : ""}`}
      data-no-drawer-gesture
      initial={{ backgroundColor: "rgba(24, 28, 26, 0)" }}
      onClickCapture={(event) => {
        if (!isClosing) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      role="dialog"
      transition={{ duration: reducedMotion || isDismissing ? 0 : 0.22 }}
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
            backgroundColor: `rgba(15, 19, 17, ${0.72 * backdropOpacity})`,
            opacity: isClosing ? 0 : 1,
          }}
          className={`photo-viewer-stage-wrap${imageTransitioning ? " is-image-transitioning" : ""}${!entranceFinished ? " is-entering" : ""}`}
          initial={{ backgroundColor: "rgba(15, 19, 17, 0)", opacity: 1 }}
          ref={stageRef}
          transition={{
            duration: reducedMotion || isDismissing ? 0 : isClosing ? 0.08 : 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="photo-viewer-track-viewport" ref={trackViewportRef}>
            <div
              className={`photo-viewer-track${photos.length === 1 ? " is-single" : ""}${slideAnimating ? " is-animating" : ""}`}
              onTransitionEnd={onTrackTransitionEnd}
              style={{
                transform: photos.length > 1
                  ? `translate3d(calc(-100% + ${slideX}px), 0, 0)`
                  : "translate3d(0, 0, 0)",
              }}
            >
              {visiblePhotos.map(({ position, photo: visiblePhoto }) => (
                <div
                  className={`photo-viewer-slide${position === 0 ? " is-current" : ""}`}
                  key={`${visiblePhoto.id}-${position}`}
                >
                  <div className="photo-viewer-image-entrance">
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
                </div>
              ))}
            </div>
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
        {body ? <p className={`photo-viewer-post-context${scale > 1.02 ? " is-hidden" : ""}`}>{body}</p> : null}
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

      {openingVisual && !entranceFinished && !isClosing ? (
        <motion.div
          animate={{
            borderRadius: [
              openingVisual.fromRadius,
              openingVisual.toRadius,
              openingVisual.toRadius,
            ],
            height: openingVisual.to.height,
            left: openingVisual.to.left,
            top: openingVisual.to.top,
            width: openingVisual.to.width,
          }}
          className="photo-viewer-open-visual"
          initial={{
            borderRadius: openingVisual.fromRadius,
            height: openingVisual.from.height,
            left: openingVisual.from.left,
            top: openingVisual.from.top,
            width: openingVisual.from.width,
          }}
          onAnimationComplete={() => setEntranceComplete(true)}
          transition={{
            duration: 0.32,
            ease: [0.22, 1, 0.36, 1],
            borderRadius: {
              duration: 0.32,
              ease: [0.4, 0, 0.2, 1],
              times: [0, 0.618, 1],
            },
          }}
        >
          <img alt="" aria-hidden="true" draggable={false} src={openingVisual.src} />
        </motion.div>
      ) : null}

      {closeVisual ? (
        <motion.div
          animate={{
            borderRadius: [
              closeVisual.fromRadius,
              closeVisual.fromRadius,
              closeVisual.toRadius,
            ],
            height: closeVisual.to.height,
            left: closeVisual.to.left,
            opacity: [1, 1, 0],
            top: closeVisual.to.top,
            width: closeVisual.to.width,
          }}
          className="photo-viewer-close-visual"
          initial={{
            borderRadius: closeVisual.fromRadius,
            height: closeVisual.from.height,
            left: closeVisual.from.left,
            opacity: 1,
            top: closeVisual.from.top,
            width: closeVisual.from.width,
          }}
          transition={{
            duration: reducedMotion ? 0 : CLOSE_DURATION / 1000,
            ease: [0.22, 1, 0.36, 1],
            borderRadius: {
              duration: reducedMotion ? 0 : CLOSE_DURATION / 1000,
              ease: [0.4, 0, 0.2, 1],
              times: [0, 0.382, 1],
            },
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
