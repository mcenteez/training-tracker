"use client";

import { Button } from "@/components/ui/button";

export default function TeamDrilldownError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-semibold">
        Unable to load drill-down facts
      </h1>
      <p className="text-sm text-muted-foreground">
        The metric facts could not be loaded. Try again.
      </p>
      <Button type="button" onClick={reset} className="w-fit">
        Retry
      </Button>
    </main>
  );
}
