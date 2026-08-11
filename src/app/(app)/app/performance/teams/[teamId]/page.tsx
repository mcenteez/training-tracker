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
import { loadAuthorizedTeamContext } from "@/lib/team-context";
import { listTeamAssignmentCompliance } from "@/modules/assignments/db/team-compliance-queries";
import { listTeamMembersByTeamId } from "@/modules/teams/db/queries";

type TeamPerformancePageProps = {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ window?: string }>;
};

function parseWindowDays(value: string | undefined): number | null {
  return value === "90" ? 90 : value === "all" ? null : 30;
}

function dateLabel(assignment: {
  startDate: string | null;
  endDate: string | null;
  scheduledDate: string | null;
}): string {
  return assignment.scheduledDate
    ? assignment.scheduledDate
    : `${assignment.startDate} to ${assignment.endDate}`;
}

export default async function TeamPerformancePage({
  params,
  searchParams,
}: TeamPerformancePageProps) {
  const { teamId } = await params;
  const filters = await searchParams;
  const windowDays = parseWindowDays(filters.window);
  const context = await loadAuthorizedTeamContext(teamId, "team.read");
  const organizationId = context.membership.organizationId;
  const [members, assignmentCompliance] = await withDatabase((database) =>
    Promise.all([
      listTeamMembersByTeamId(database, { organizationId, teamId }),
      listTeamAssignmentCompliance(database, {
        organizationId,
        teamId,
        windowDays,
      }),
    ]),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Team Performance
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {context.team.name}
          </CardTitle>
          <CardDescription>
            {context.membership.organizationName} - {members.length} roster
            entries
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Roster readiness</CardTitle>
          <CardDescription>
            Current team members and their assigned team roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <ul className="space-y-2.5">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                >
                  <p className="text-sm font-medium">
                    {member.fullName?.trim() || member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.teamRole}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No team members have been assigned yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Workout compliance</CardTitle>
          <CardDescription>
            Assigned means due today; missed is an incomplete past occurrence;
            upcoming is scheduled after today.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            className="flex flex-wrap gap-2"
            aria-label="Compliance time window"
          >
            {[
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "all", label: "All time" },
            ].map((option) => {
              const active =
                (windowDays === null && option.value === "all") ||
                String(windowDays) === option.value;
              return (
                <Button
                  key={option.value}
                  asChild
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  <Link href={`?window=${option.value}`}>{option.label}</Link>
                </Button>
              );
            })}
          </div>

          {assignmentCompliance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published assignments cover this team yet.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {assignmentCompliance.map((assignment) => (
                <li key={assignment.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/app/performance/teams/${teamId}/assignments/${assignment.id}?window=${windowDays ?? "all"}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {assignment.sourceName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {assignment.sourceType} - {dateLabel(assignment)} -{" "}
                        {assignment.recipientCount} recipients
                      </p>
                    </div>
                    <span className="rounded-md border px-2 py-1 text-xs font-medium capitalize">
                      {assignment.status}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Assigned
                      </dt>
                      <dd className="font-semibold">
                        {assignment.counts.assigned}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        In progress
                      </dt>
                      <dd className="font-semibold">
                        {assignment.counts.inProgress}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Submitted
                      </dt>
                      <dd className="font-semibold">
                        {assignment.counts.submitted}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Missed</dt>
                      <dd className="font-semibold">
                        {assignment.counts.missed}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Upcoming
                      </dt>
                      <dd className="font-semibold">
                        {assignment.counts.upcoming}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Latest activity:{" "}
                    {assignment.latestActivityAt?.toLocaleString() ?? "None"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
