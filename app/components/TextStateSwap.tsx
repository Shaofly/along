"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export function TextStateSwap({ labels, text }: { labels: string[]; text: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <span aria-atomic="true" aria-live="polite" className="text-state-swap">
      {labels.map((label) => (
        <span aria-hidden="true" className="text-state-swap-measure" key={label}>{label}</span>
      ))}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
          className="text-state-swap-value"
          exit={{ filter: "blur(2px)", opacity: 0, y: -4 }}
          initial={{ filter: "blur(2px)", opacity: 0, y: 4 }}
          key={text}
          transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeInOut" }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
