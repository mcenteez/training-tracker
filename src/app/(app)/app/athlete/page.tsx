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
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

export default async function AthleteDashboardPage() {
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  const teams = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Athlete Hub
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Your training dashboard
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Stay focused on your teams and upcoming workouts.
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Organization: {context.membership.organizationName}
          </p>
        </CardHeader>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">My teams</CardTitle>
          <CardDescription>
            Teams where you currently have an assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teams.length > 0 ? (
            <ul className="space-y-2.5">
              {teams.map((team) => (
                <li
                  key={team.teamId}
                  className="rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                >
                  <p className="text-sm font-medium">{team.teamName}</p>
                  <p className="text-xs text-muted-foreground">
                    Team role: {team.teamRole}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are not assigned to a team yet. Contact your coach or
              organization manager.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Workouts</CardTitle>
          <CardDescription>
            Your assigned workout list will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No workout assignments are available yet. This area will support
            workout logging when the workout domain is implemented.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
