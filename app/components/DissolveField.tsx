"use client";

import { X } from "lucide-react";
import type { ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

type SharedProps = {
  onValueChange: (value: string) => void;
  value: string;
  wrapperClassName?: string;
};

type DissolveInputProps = SharedProps & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">;
type DissolveTextareaProps = SharedProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value">;

export function DissolveInput(props: DissolveInputProps) {
  return <DissolveControl kind="input" {...props} />;
}

export function DissolveTextarea(props: DissolveTextareaProps) {
  return <DissolveControl kind="textarea" {...props} />;
}

function DissolveControl(
  props: ({ kind: "input" } & DissolveInputProps) | ({ kind: "textarea" } & DissolveTextareaProps),
) {
  const { kind, onValueChange, value, wrapperClassName = "", ...fieldProps } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const clearingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [ghostValue, setGhostValue] = useState("");
  const [glowBackground, setGlowBackground] = useState("");
  const placeholder = String(fieldProps.placeholder ?? "");

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    wrapRef.current?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  }, []);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const overlays = [mirrorRef.current, placeholderRef.current];
    const sync = () => copyTextMetrics(field, overlays);
    let cancelled = false;
    sync();

    void document.fonts?.ready.then(() => {
      if (!cancelled) sync();
    });

    if (typeof ResizeObserver === "undefined") return () => { cancelled = true; };
    const observer = new ResizeObserver(sync);
    observer.observe(field);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [kind, placeholder]);

  function clearValue() {
    const wrap = wrapRef.current;
    const field = fieldRef.current;
    const mirror = mirrorRef.current;
    const glow = glowRef.current;
    if (!wrap || !field || !mirror || !glow || !value || clearingRef.current) return;
    const wasFocused = document.activeElement === field;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onValueChange("");
      if (wasFocused) field.focus({ preventScroll: true });
      return;
    }

    clearingRef.current = true;
    copyTextMetrics(field, [mirror, placeholderRef.current]);
    setGhostValue(value);
    setGlowBackground(buildGlowLayers(wrap, field, value));
    setClearing(true);
    onValueChange("");

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const mirrorAnimation = mirror.animate(
          [
            { filter: "blur(0)", opacity: 1, transform: "translateY(0)" },
            { filter: "blur(2px)", opacity: 0, transform: "translateY(12px)" },
          ],
          { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
        );
        const placeholder = placeholderRef.current;
        const placeholderAnimation = placeholder?.animate(
          [
            { filter: "blur(2px)", opacity: 0, transform: "translateY(-12px)" },
            { filter: "blur(0)", opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
        );
        glow.animate(
          [
            { opacity: 0, offset: 0 },
            { opacity: 0, offset: 0.05 },
            { opacity: 0.42, offset: 0.19 },
            { opacity: 0, offset: 1 },
          ],
          { duration: 1000, easing: "ease-in-out", fill: "forwards" },
        );
        placeholderAnimation?.finished.then(() => {
          flushSync(() => {
            setClearing(false);
            setGhostValue("");
          });
          mirrorAnimation.cancel();
          placeholderAnimation.cancel();
        }).catch(() => undefined);
      });
    });
    timerRef.current = window.setTimeout(() => {
      glow.getAnimations().forEach((animation) => animation.cancel());
      setGlowBackground("");
      clearingRef.current = false;
      timerRef.current = null;
      if (wasFocused) field.focus({ preventScroll: true });
    }, 1000);
  }

  const commonProps = {
    ...fieldProps,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onValueChange(event.target.value);
    },
    value,
  };

  return (
    <div
      className={`dissolve-field${kind === "textarea" ? " dissolve-field--textarea" : ""}${value ? " has-value" : ""}${clearing ? " is-clearing" : ""}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
      ref={wrapRef}
    >
      {kind === "textarea" ? (
        <textarea
          {...commonProps as TextareaHTMLAttributes<HTMLTextAreaElement>}
          ref={(node) => { fieldRef.current = node; }}
        />
      ) : (
        <input
          {...commonProps as InputHTMLAttributes<HTMLInputElement>}
          ref={(node) => { fieldRef.current = node; }}
        />
      )}
      <div aria-hidden="true" className="dissolve-field-mirror" ref={mirrorRef}>{ghostValue}</div>
      <div aria-hidden="true" className="dissolve-field-placeholder" ref={placeholderRef}>{placeholder}</div>
      <div
        aria-hidden="true"
        className="dissolve-field-glow"
        ref={glowRef}
        style={{ background: glowBackground }}
      />
      <button
        aria-label="清空输入内容"
        className="dissolve-field-clear"
        disabled={!value}
        onClick={clearValue}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        <X aria-hidden="true" size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function copyTextMetrics(
  field: HTMLInputElement | HTMLTextAreaElement,
  overlays: Array<HTMLDivElement | null>,
) {
  const styles = getComputedStyle(field);
  for (const overlay of overlays) {
    if (!overlay) continue;
    overlay.style.font = styles.font;
    overlay.style.letterSpacing = styles.letterSpacing;
    overlay.style.lineHeight = styles.lineHeight;
    overlay.style.padding = styles.padding;
    overlay.style.textAlign = styles.textAlign;
  }
}

function buildGlowLayers(
  wrap: HTMLDivElement,
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return "";
  const styles = getComputedStyle(field);
  context.font = styles.font;
  const width = wrap.clientWidth || 280;
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 16;
  const words = text.split(/(\s+)/).slice(0, 24);
  const layers: string[] = [];
  let x = 0;

  for (const word of words) {
    const wordWidth = context.measureText(word).width;
    if (word.trim()) {
      const center = Math.min(width - 18, paddingLeft + x + wordWidth / 2);
      const radius = Math.max(9, wordWidth * 0.62);
      layers.push(
        `radial-gradient(ellipse ${radius.toFixed(1)}px 9px at ${((center / width) * 100).toFixed(2)}% 100%, rgba(154, 131, 91, 0.2), transparent)`,
      );
    }
    x += wordWidth;
    if (x > width - paddingLeft * 2) x = 0;
  }
  return layers.join(", ");
}
