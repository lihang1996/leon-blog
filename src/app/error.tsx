"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/views/error-view";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App Error Boundary caught:", error);
  }, [error]);

  return <ErrorView error={error} reset={reset} />;
}
