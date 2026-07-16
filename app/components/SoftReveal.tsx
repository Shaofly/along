import type { CSSProperties, ReactNode } from "react";

export function SoftReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`soft-reveal${className ? ` ${className}` : ""}`}
      style={{ "--soft-reveal-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
