import type { ReactNode } from "react";

export function SkeletonReveal({
  children,
  className = "",
  initialHeight,
}: {
  children: ReactNode;
  className?: string;
  initialHeight?: number;
}) {
  return (
    <div
      className={`skeleton-reveal-content${className ? ` ${className}` : ""}`}
      style={initialHeight ? { minHeight: initialHeight } : undefined}
    >
      {children}
    </div>
  );
}

export function SummaryListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="summary-skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <div className="summary-skeleton-row" key={index}>
          <i />
          <span><b /><b /></span>
          <em />
        </div>
      ))}
    </div>
  );
}

export function FeedSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="feed-skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <div className="feed-skeleton-row" key={index}>
          <div><i /><span><b /><b /></span></div>
          <em /><em /><em />
        </div>
      ))}
    </div>
  );
}
