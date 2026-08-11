export default function TeamPerformanceLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
      <div className="h-32 animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-md bg-muted" />
      <span className="sr-only">Loading team performance</span>
    </main>
  );
}
