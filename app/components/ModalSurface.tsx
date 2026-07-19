"use client";

import { createPortal } from "react-dom";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type ModalPhase = "opening" | "open" | "closing";

let openModalCount = 0;
let previousBodyOverflow = "";
let shellWasInert = false;
let rootRestoreFocus: HTMLElement | null = null;

function cssDuration(variable: string, fallback: number) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  if (!value) return fallback;
  if (value.endsWith("ms")) return Number.parseFloat(value);
  if (value.endsWith("s")) return Number.parseFloat(value) * 1000;
  return fallback;
}

function focusableElements(container: HTMLElement) {
  const elements = [...container.querySelectorAll<HTMLElement>(
    [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(","),
  )].filter((element) => !element.closest("[inert]"));
  const initial = container.querySelector<HTMLElement>(
    "[data-modal-initial-focus]",
  );
  return initial
    ? [initial, ...elements.filter((element) => element !== initial)]
    : elements;
}

export function ModalSurface({
  children,
  labelledBy,
  onAfterClose,
  onRequestClose,
  open,
  role = "dialog",
  size = "wide",
}: {
  children: ReactNode;
  labelledBy: string;
  onAfterClose?: () => void;
  onRequestClose: () => void;
  open: boolean;
  role?: "alertdialog" | "dialog";
  size?: "compact" | "standard" | "wide";
}) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<ModalPhase>("opening");
  const [portalReady, setPortalReady] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPortalReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!portalReady) return;
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        if (!mounted) {
          setPhase("opening");
          setMounted(true);
          return;
        }
        setPhase("open");
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!mounted) return;
    let timer: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      setPhase("closing");
      timer = window.setTimeout(() => {
        setMounted(false);
        onAfterClose?.();
      }, cssDuration("--modal-close-dur", 150));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [mounted, onAfterClose, open, portalReady]);

  useEffect(() => {
    if (!mounted || !portalReady) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const shell = document.querySelector<HTMLElement>(".app-shell-stage");
    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      rootRestoreFocus = restoreFocusRef.current;
      shellWasInert = shell?.hasAttribute("inert") ?? false;
      if (!shellWasInert) shell?.setAttribute("inert", "");
    }
    openModalCount += 1;

    const focusFrame = window.requestAnimationFrame(() => {
      focusableElements(dialogRef.current ?? document.body)[0]?.focus({
        preventScroll: true,
      });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (!shellWasInert) shell?.removeAttribute("inert");
        rootRestoreFocus?.focus({ preventScroll: true });
        rootRestoreFocus = null;
      } else {
        restoreFocusRef.current?.focus({ preventScroll: true });
      }
    };
  }, [mounted, portalReady]);

  useEffect(() => {
    if (!mounted || !portalReady) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const layers = [
        ...document.querySelectorAll<HTMLElement>("[data-modal-surface]"),
      ];
      if (layers.at(-1) !== dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onRequestClose, portalReady]);

  if (!mounted || !portalReady) return null;

  const phaseClass =
    phase === "open" ? " is-open" : phase === "closing" ? " is-closing" : "";

  return createPortal(
    <div
      className={`modal-backdrop modal-portal-backdrop${phaseClass}`}
      data-modal-backdrop
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onRequestClose();
      }}
      role="presentation"
    >
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={`t-modal modal-surface-frame modal-surface-frame--${size}${phaseClass}`}
        data-modal-surface
        ref={dialogRef}
        role={role}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
