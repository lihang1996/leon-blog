import { LoadingState } from "@/components/ui/loading-state";

export default function AdminLoading() {
  return (
    <div className="py-8" aria-live="polite">
      <LoadingState rows={4} />
    </div>
  );
}
