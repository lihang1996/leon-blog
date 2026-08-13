/**
 * Skeleton loader (UI spec §8.3). Only simulates the current region and obeys
 * prefers-reduced-motion; no infinite decorative animation.
 */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse motion-reduce:animate-none" role="status" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="border-b border-border py-6">
          <div className="h-3 w-40 rounded bg-border" />
          <div className="mt-3 h-6 w-3/4 rounded bg-border" />
          <div className="mt-3 h-3 w-1/2 rounded bg-border" />
        </div>
      ))}
    </div>
  );
}
