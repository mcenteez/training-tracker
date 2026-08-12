export default function TeamPerformanceLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8">
      <div className="h-32 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-md bg-muted" />
      <span className="sr-only">Loading team performance</span>
    </main>
  );
}
