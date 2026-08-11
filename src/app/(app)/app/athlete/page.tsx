import { redirect } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { listPublishedAssignmentsForAthlete } from "@/modules/assignments/db/queries";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

function formatDate(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AthleteDashboardPage() {
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  const [teams, assignments] = await Promise.all([
    withDatabase((database) =>
      listTeamMembershipsForUserInOrganization(database, {
        organizationId: context.membership.organizationId,
        userId: context.user.id,
      }),
    ),
    withDatabase((database) =>
      listPublishedAssignmentsForAthlete(database, {
        organizationId: context.membership.organizationId,
        athleteUserId: context.user.id,
      }),
    ),
  ]);

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
            Current assignments and sessions already in progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assignments.length > 0 ? (
            <ul className="space-y-3">
              {assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="rounded-lg border border-border/70 bg-background/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {assignment.sourceName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.sourceType === "plan" ? "Plan" : "Workout"}
                        {assignment.sourceType === "plan"
                          ? ` · ${assignment.startDate} to ${assignment.endDate}`
                          : ` · Scheduled ${assignment.scheduledDate}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Published: {formatDate(assignment.publishedAt)}
                      </p>
                      {assignment.status === "canceled" ? (
                        <p className="text-xs font-medium text-destructive">
                          Canceled · Existing session available
                        </p>
                      ) : null}
                    </div>

                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/athlete/assignments/${assignment.id}`}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No assignments are available yet.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
