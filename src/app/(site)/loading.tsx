import { LoadingState } from "@/components/ui/loading-state";

export default function SiteLoading() {
  return (
    <div className="py-12" aria-live="polite">
      <LoadingState rows={4} />
    </div>
  );
}
