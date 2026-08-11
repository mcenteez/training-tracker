import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { resolveTeamPerformancePortfolio } from "@/modules/access-control/landing";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

export default async function TeamPerformancePortfolioPage() {
  const context = await loadActiveAppContext();
  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );
  const portfolio = resolveTeamPerformancePortfolio(
    teamMemberships.map((membership) => ({
      ...membership,
      role: membership.teamRole,
    })),
  );
  const portfolioTeams = portfolio.memberships;

  if (!portfolio.teamRole) {
    redirect("/app");
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Team Performance
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {context.membership.organizationName}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            {portfolio.teamRole === "manager"
              ? "Performance across the teams you manage."
              : "Read-only performance across the teams you can view."}
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {portfolioTeams.map((team) => (
          <Card
            key={team.teamId}
            className="border-border/70 bg-card/95 shadow-xl shadow-black/15"
          >
            <CardHeader>
              <CardTitle className="text-xl">{team.teamName}</CardTitle>
              <CardDescription>Team role: {team.teamRole}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/app/performance/teams/${team.teamId}`}
                className="inline-flex h-10 items-center rounded-md border border-border/80 bg-background px-4 text-sm font-medium hover:bg-accent/40"
              >
                View team performance
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
