"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
};

type Geometry = { x: number; width: number; center: number };

export function AnimatedReveal({
  children,
  className = "",
  show,
}: {
  children: ReactNode;
  className?: string;
  show: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={show ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
      aria-hidden={!show}
      className={`animated-reveal${className ? ` ${className}` : ""}`}
      inert={show ? undefined : true}
      initial={false}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              height: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.2, ease: "easeOut" },
            }
      }
    >
      <div className="animated-reveal-inner">{children}</div>
    </motion.div>
  );
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  className = "",
  onValueChange,
  options,
  role = "radiogroup",
  value,
}: {
  ariaLabel: string;
  className?: string;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  role?: "radiogroup" | "tablist";
  value: Value;
}) {
  const generatedId = useId().replaceAll(":", "");
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragRef = useRef<{
    captureTarget: HTMLButtonElement;
    pointerX: number;
    center: number;
    moved: boolean;
    threshold: number;
  } | null>(null);
  const dragGeometryRef = useRef<Geometry | null>(null);
  const suppressClickRef = useRef(false);
  const [geometries, setGeometries] = useState<Geometry[]>([]);
  const [dragGeometry, setDragGeometry] = useState<Geometry | null>(null);

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedGeometry = geometries[selectedIndex];
  const indicatorGeometry = dragGeometry ?? selectedGeometry;

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function measure() {
      const trackBounds = track!.getBoundingClientRect();
      const next = buttonRefs.current.map((button) => {
        const bounds = button?.getBoundingClientRect();
        const x = bounds ? bounds.left - trackBounds.left : 0;
        const width = bounds?.width ?? 0;
        return { x, width, center: x + width / 2 };
      });
      setGeometries((current) => {
        const unchanged = current.length === next.length && current.every(
          (item, index) => Math.abs(item.x - next[index].x) < 0.25 && Math.abs(item.width - next[index].width) < 0.25,
        );
        return unchanged ? current : next;
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    buttonRefs.current.forEach((button) => button && observer.observe(button));
    return () => observer.disconnect();
  }, [options]);

  function geometryAt(center: number) {
    if (geometries.length === 0) return null;
    if (center <= geometries[0].center) return geometries[0];
    const last = geometries.at(-1)!;
    if (center >= last.center) return last;

    const rightIndex = geometries.findIndex((geometry) => geometry.center >= center);
    const left = geometries[rightIndex - 1];
    const right = geometries[rightIndex];
    const progress = (center - left.center) / (right.center - left.center);
    const x = left.x + (right.x - left.x) * progress;
    const width = left.width + (right.width - left.width) * progress;
    return { x, width, center: x + width / 2 };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !selectedGeometry) return;
    const target = (event.target as Element).closest<HTMLButtonElement>(".segmented-control-option");
    if (!target || !event.currentTarget.contains(target)) return;
    const targetIndex = buttonRefs.current.indexOf(target);
    const startGeometry = geometries[targetIndex] ?? selectedGeometry;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      captureTarget: target,
      pointerX: event.clientX,
      center: startGeometry.center,
      moved: false,
      threshold: 3,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.pointerX;
    if (!drag.moved && Math.abs(delta) < drag.threshold) return;
    drag.moved = true;
    const first = geometries[0];
    const last = geometries.at(-1);
    if (!first || !last) return;
    const center = Math.max(first.center, Math.min(last.center, drag.center + delta));
    const nextGeometry = geometryAt(center);
    dragGeometryRef.current = nextGeometry;
    setDragGeometry(nextGeometry);
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) {
      drag.captureTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;

    const releasedGeometry = dragGeometryRef.current;
    if (drag.moved && releasedGeometry) {
      const enabled = geometries
        .map((geometry, index) => ({ geometry, index }))
        .filter(({ index }) => !options[index].disabled);
      const nearest = enabled.reduce((best, item) =>
        Math.abs(item.geometry.center - releasedGeometry.center) < Math.abs(best.geometry.center - releasedGeometry.center)
          ? item
          : best,
      );
      suppressClickRef.current = true;
      onValueChange(options[nearest.index].value);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragGeometryRef.current = null;
    setDragGeometry(null);
  }

  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.captureTarget.hasPointerCapture(event.pointerId)) {
      drag.captureTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    dragGeometryRef.current = null;
    setDragGeometry(null);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, fromIndex: number) {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    let nextIndex = fromIndex;
    if (event.key === "Home") nextIndex = options.findIndex((option) => !option.disabled);
    if (event.key === "End") {
      nextIndex = options.findLastIndex((option) => !option.disabled);
    }
    if (direction) {
      do {
        nextIndex = (nextIndex + direction + options.length) % options.length;
      } while (options[nextIndex].disabled && nextIndex !== fromIndex);
    }
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    onValueChange(options[nextIndex].value);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`segmented-control${dragGeometry ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
      onPointerCancel={cancelDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      ref={trackRef}
      role={role}
    >
      {indicatorGeometry ? (
        <motion.span
          animate={{ x: indicatorGeometry.x, width: indicatorGeometry.width }}
          aria-hidden="true"
          className="segmented-control-indicator"
          initial={false}
          layoutId={`segmented-${generatedId}`}
          transition={
            dragGeometry || reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 30, mass: 0.8 }
          }
        />
      ) : null}
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <motion.button
            aria-checked={role === "radiogroup" ? selected : undefined}
            aria-selected={role === "tablist" ? selected : undefined}
            className="segmented-control-option"
            data-selected={selected || undefined}
            disabled={option.disabled}
            key={option.value}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onValueChange(option.value);
            }}
            onKeyDown={(event) => moveWithKeyboard(event, index)}
            ref={(button) => {
              buttonRefs.current[index] = button;
            }}
            role={role === "tablist" ? "tab" : "radio"}
            tabIndex={selected ? 0 : -1}
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
}
