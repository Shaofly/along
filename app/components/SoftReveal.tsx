"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { ReactNode, useRef } from "react";

export function SoftReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2, once: true });
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={inView ? { filter: "blur(0px)", opacity: 1, y: 0 } : undefined}
      className={`soft-reveal${className ? ` ${className}` : ""}`}
      initial={reducedMotion ? false : { filter: "blur(1.5px)", opacity: 0, y: 8 }}
      ref={ref}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { delay, duration: 0.46, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
