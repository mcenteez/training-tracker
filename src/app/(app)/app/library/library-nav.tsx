"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/app/library/plans", label: "Plans" },
  { href: "/app/library/workouts", label: "Workouts" },
  { href: "/app/library/exercises", label: "Exercises" },
];

export function LibraryNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Library sections" className="mt-6 flex gap-6">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 pb-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
