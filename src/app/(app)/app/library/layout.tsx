import { redirect } from "next/navigation";

import { loadLibraryAppContext } from "@/lib/library-context";
import { LibraryNav } from "./library-nav";

export default async function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await loadLibraryAppContext();

  if (context.libraryAccess === "none") {
    redirect("/app?error=forbidden_library");
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b border-border/70 pb-6">
        <p className="text-xs font-semibold text-primary uppercase">
          {context.membership.organizationName}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Training Library
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Build reusable exercises and workout templates for your coaching
              staff.
            </p>
          </div>
          <span className="border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium">
            {context.libraryAccess === "manage" ? "Can manage" : "Read only"}
          </span>
        </div>
        <LibraryNav />
      </header>
      {children}
    </main>
  );
}
