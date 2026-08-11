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
import { listOrganizationInvitationsByOrganizationId } from "@/modules/organizations/db/queries";
import {
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";

export default async function OrganizationPerformancePage() {
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole === "athlete") {
    redirect("/app");
  }

  const { organizationId, organizationName, organizationRole } =
    context.membership;
  const [teams, organizationMembers, teamMembers, invitations] =
    await withDatabase((database) =>
      Promise.all([
        listTeamsByOrganizationId(database, organizationId),
        listOrganizationMembersByOrganizationId(database, organizationId),
        listTeamMembersByOrganizationId(database, organizationId),
        listOrganizationInvitationsByOrganizationId(database, organizationId),
      ]),
    );
  const pendingInvitationCount = invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;
  const athleteCount = organizationMembers.filter(
    (member) => member.organizationRole === "athlete",
  ).length;
  const teamSummaries = teams.map((team) => ({
    ...team,
    memberCount: teamMembers.filter((member) => member.teamId === team.id)
      .length,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Organization Performance
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {organizationName}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Organization-wide readiness, participation, and compliance overview.
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Organization role: {organizationRole}
          </p>
        </CardHeader>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Teams tracked", teams.length],
          ["Athletes", athleteCount],
          ["Roster entries", teamMembers.length],
          ["Pending invitations", pendingInvitationCount],
        ].map(([label, value]) => (
          <Card
            key={label}
            className="border-border/70 bg-card/95 shadow-md shadow-black/10"
          >
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Team participation</CardTitle>
          <CardDescription>
            Current roster coverage across the organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamSummaries.length > 0 ? (
            <ul className="space-y-2.5">
              {teamSummaries.map((team) => (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                >
                  <p className="text-sm font-medium">{team.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {team.memberCount} roster entries
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No teams have been created yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Compliance</CardTitle>
          <CardDescription>
            Workout assignment and completion metrics will appear here when the
            workout domain is available.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
