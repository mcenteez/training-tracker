import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadAuthorizedTeamContext } from "@/lib/team-context";
import { listTeamMembersByTeamId } from "@/modules/teams/db/queries";

type TeamPerformancePageProps = {
  params: Promise<{ teamId: string }>;
};

export default async function TeamPerformancePage({
  params,
}: TeamPerformancePageProps) {
  const { teamId } = await params;
  const context = await loadAuthorizedTeamContext(teamId, "team.read");
  const organizationId = context.membership.organizationId;
  const members = await withDatabase((database) =>
    listTeamMembersByTeamId(database, { organizationId, teamId }),
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
            Assignment coverage and completion trends will appear here when the
            workout domain is available.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
