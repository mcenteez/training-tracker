"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AppNavItem {
  href: string;
  label: string;
}

interface AppHeaderClientProps {
  navigationItems: AppNavItem[];
  activeOrganizationName?: string;
  canSwitchOrganization?: boolean;
  localAuthEnabled?: boolean;
}

export function AppHeaderClient({
  navigationItems,
  activeOrganizationName,
  canSwitchOrganization = false,
  localAuthEnabled = false,
}: AppHeaderClientProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="inline-flex items-center rounded-md border border-primary/30 bg-primary/12 px-2 py-1 text-xs font-medium tracking-wide text-primary uppercase"
          >
            Training Tracker
          </Link>

          {activeOrganizationName ? (
            canSwitchOrganization ? (
              <Link
                href="/app/organizations"
                className="hidden text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:inline"
              >
                {activeOrganizationName}
              </Link>
            ) : (
              <span className="hidden text-xs text-muted-foreground md:inline">
                {activeOrganizationName}
              </span>
            )
          ) : null}

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1.5 sm:flex"
          >
            {navigationItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/app" && pathname.startsWith(item.href));

              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8",
                    isActive && "ring-1 ring-primary/20 shadow-sm",
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Account
          </span>
          {localAuthEnabled ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dev/auth">Switch persona</Link>
            </Button>
          ) : (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8 ring-1 ring-border/70",
                },
              }}
            />
          )}
        </div>
      </div>
      {navigationItems.length > 0 ? (
        <nav
          aria-label="Primary mobile"
          className="mx-auto flex w-full max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3 sm:hidden"
        >
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/app" && pathname.startsWith(item.href));

            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
              >
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
