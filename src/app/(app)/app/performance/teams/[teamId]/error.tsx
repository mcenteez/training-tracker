"use client";

import { Button } from "@/components/ui/button";

export default function TeamPerformanceError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-4 px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-semibold">
        Team performance is unavailable
      </h1>
      <p className="text-sm text-muted-foreground">
        The latest compliance data could not be loaded.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
