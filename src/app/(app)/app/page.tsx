import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  findOrganizationNameById,
  listOrganizationAuditEventsByOrganizationId,
  listOrganizationInvitationsByOrganizationId,
} from "@/modules/organizations/db/queries";
import {
  listTeamsForAthleteUser,
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";

type AppHomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getPrimaryEmailAddress(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  return (
    primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

function getFullName(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const candidate = user.fullName?.trim();
  if (candidate) {
    return candidate;
  }

  const fallback = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  return fallback || null;
}

function getFeedbackMessage(
  params: Record<string, string | string[] | undefined>,
): { kind: "success" | "error"; text: string } | null {
  const created = Array.isArray(params.created)
    ? params.created[0]
    : params.created;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  if (created === "1") {
    return { kind: "success", text: "Team created successfully." };
  }

  const forbiddenAdmin = Array.isArray(params.error)
    ? params.error[0]
    : params.error;

  if (forbiddenAdmin === "forbidden_admin") {
    return {
      kind: "error",
      text: "You do not have access to the admin interface.",
    };
  }

  const memberSaved = Array.isArray(params.memberSaved)
    ? params.memberSaved[0]
    : params.memberSaved;
  const memberRemoved = Array.isArray(params.memberRemoved)
    ? params.memberRemoved[0]
    : params.memberRemoved;

  if (memberSaved === "1") {
    return { kind: "success", text: "Team member saved successfully." };
  }

  if (memberRemoved === "1") {
    return { kind: "success", text: "Team member removed successfully." };
  }

  const orgMemberUpdated = Array.isArray(params.orgMemberUpdated)
    ? params.orgMemberUpdated[0]
    : params.orgMemberUpdated;
  const orgMemberRemoved = Array.isArray(params.orgMemberRemoved)
    ? params.orgMemberRemoved[0]
    : params.orgMemberRemoved;

  if (orgMemberUpdated === "1") {
    return { kind: "success", text: "Organization member role updated." };
  }

  if (orgMemberRemoved === "1") {
    return { kind: "success", text: "Organization member removed." };
  }

  const ownershipTransferred = Array.isArray(params.ownershipTransferred)
    ? params.ownershipTransferred[0]
    : params.ownershipTransferred;

  if (ownershipTransferred === "1") {
    return { kind: "success", text: "Organization ownership transferred." };
  }

  const inviteCreated = Array.isArray(params.inviteCreated)
    ? params.inviteCreated[0]
    : params.inviteCreated;
  const inviteRevoked = Array.isArray(params.inviteRevoked)
    ? params.inviteRevoked[0]
    : params.inviteRevoked;
  const inviteAccepted = Array.isArray(params.inviteAccepted)
    ? params.inviteAccepted[0]
    : params.inviteAccepted;

  if (inviteCreated === "1") {
    return { kind: "success", text: "Invitation created successfully." };
  }

  if (inviteRevoked === "1") {
    return { kind: "success", text: "Invitation revoked successfully." };
  }

  if (inviteAccepted === "1") {
    return { kind: "success", text: "Invitation accepted successfully." };
  }

  if (error === "invalid_team_name") {
    return {
      kind: "error",
      text: "Enter a team name between 2 and 120 characters.",
    };
  }

  if (error === "missing_email") {
    return {
      kind: "error",
      text: "Unable to load your account email. Sign out and try again.",
    };
  }

  if (error === "forbidden") {
    return {
      kind: "error",
      text: "Your current role is not allowed to create teams.",
    };
  }

  if (error === "forbidden_member_manage") {
    return {
      kind: "error",
      text: "Your current role is not allowed to manage members for this team.",
    };
  }

  if (error === "invalid_team_member_input") {
    return {
      kind: "error",
      text: "Member input is invalid. Try again.",
    };
  }

  if (error === "invalid_invite_input") {
    return {
      kind: "error",
      text: "Invitation input is invalid. Check email and role.",
    };
  }

  if (error === "forbidden_invite_manage") {
    return {
      kind: "error",
      text: "Your current role is not allowed to manage invitations.",
    };
  }

  if (error === "duplicate_invite") {
    return {
      kind: "error",
      text: "A pending invitation already exists for that email.",
    };
  }

  if (error === "invite_not_found") {
    return {
      kind: "error",
      text: "That invitation is no longer available.",
    };
  }

  if (error === "invalid_org_member_input") {
    return {
      kind: "error",
      text: "Organization member input is invalid.",
    };
  }

  if (error === "forbidden_org_member_manage") {
    return {
      kind: "error",
      text: "Your role cannot manage organization members.",
    };
  }

  return null;
}

export default async function AppHomePage({ searchParams }: AppHomePageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);
  const fullName = getFullName(user);

  if (!email) {
    redirect("/sign-in");
  }

  const data = await withDatabase(async (database) => {
    const userContext = await getAuthenticatedUserContext(database, {
      clerkUserId: userId,
      email,
      fullName,
    });

    if (!userContext.organizationId) {
      return {
        dashboardView: "athlete" as const,
        userContext,
        organizationName: null,
        athleteTeams: [],
        teams: [],
        organizationMembers: [],
        teamMembers: [],
        invitations: [],
        auditEvents: [],
      };
    }

    if (userContext.organizationRole === "athlete") {
      const [athleteTeams, organizationName] = await Promise.all([
        listTeamsForAthleteUser(database, {
          organizationId: userContext.organizationId,
          userId: userContext.id,
        }),
        findOrganizationNameById(database, userContext.organizationId),
      ]);

      return {
        dashboardView: "athlete" as const,
        userContext,
        organizationName,
        athleteTeams,
        teams: [],
        organizationMembers: [],
        teamMembers: [],
        invitations: [],
        auditEvents: [],
      };
    }

    const [
      teams,
      organizationMembers,
      teamMembers,
      invitations,
      auditEvents,
      organizationName,
    ] = await Promise.all([
      listTeamsByOrganizationId(database, userContext.organizationId),
      listOrganizationMembersByOrganizationId(
        database,
        userContext.organizationId,
      ),
      listTeamMembersByOrganizationId(database, userContext.organizationId),
      listOrganizationInvitationsByOrganizationId(
        database,
        userContext.organizationId,
      ),
      listOrganizationAuditEventsByOrganizationId(
        database,
        userContext.organizationId,
      ),
      findOrganizationNameById(database, userContext.organizationId),
    ]);

    return {
      dashboardView: "performance" as const,
      userContext,
      organizationName,
      athleteTeams: [],
      teams,
      organizationMembers,
      teamMembers,
      invitations,
      auditEvents,
    };
  });

  if (!data.userContext.hasOrganizationMembership) {
    redirect("/onboarding/organization");
  }

  const params = await searchParams;
  const feedbackMessage = getFeedbackMessage(params);
  const roleLabel = data.userContext.organizationRole ?? "athlete";
  const organizationName = data.organizationName ?? "Unknown organization";
  const pendingInvitations = data.invitations.filter(
    (invitation) => invitation.status === "pending",
  );
  const athleteCount = data.organizationMembers.filter(
    (member) => member.organizationRole === "athlete",
  ).length;
  const canAccessAdmin =
    data.userContext.organizationRole !== null &&
    hasPermission(
      { organizationRole: data.userContext.organizationRole },
      "organization.members.manage",
    );

  if (data.dashboardView === "athlete") {
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
            <div className="flex w-fit items-center rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
              Organization:{" "}
              <span className="ml-1 font-semibold text-foreground">
                {organizationName}
              </span>
            </div>
            <div className="flex w-fit items-center rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
              Organization role:{" "}
              <span className="ml-1 font-semibold text-foreground">
                {roleLabel}
              </span>
            </div>
          </CardHeader>
        </Card>

        {feedbackMessage ? (
          <p
            className={
              feedbackMessage.kind === "success"
                ? "rounded-xl border border-emerald-500/25 bg-emerald-500/12 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
                : "rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            }
          >
            {feedbackMessage.text}
          </p>
        ) : null}

        <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
          <CardHeader>
            <CardTitle className="text-2xl">My teams</CardTitle>
            <CardDescription>
              Teams where you are currently assigned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.athleteTeams.length > 0 ? (
              <ul className="space-y-2.5">
                {data.athleteTeams.map((team) => (
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
              No workout assignments are available yet. This area will power a
              mobile-first workout logging flow in the next phase.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const teamSummaries = data.teams.map((team) => {
    const members = data.teamMembers.filter(
      (member) => member.teamId === team.id,
    );
    const athletesOnTeam = members.filter((member) => {
      const organizationMember = data.organizationMembers.find(
        (organizationMemberItem) =>
          organizationMemberItem.userId === member.userId,
      );

      return organizationMember?.organizationRole === "athlete";
    }).length;

    return {
      id: team.id,
      name: team.name,
      memberCount: members.length,
      athleteCount: athletesOnTeam,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Performance Dashboard
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Organization readiness at a glance
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Track team coverage, participation, and compliance trends. Use the
            admin interface for operational changes.
          </CardDescription>
          <div className="flex w-fit items-center rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
            Organization:{" "}
            <span className="ml-1 font-semibold text-foreground">
              {organizationName}
            </span>
          </div>
          <div className="flex w-fit items-center rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
            Organization role:{" "}
            <span className="ml-1 font-semibold text-foreground">
              {roleLabel}
            </span>
          </div>
        </CardHeader>
      </Card>

      {feedbackMessage ? (
        <p
          className={
            feedbackMessage.kind === "success"
              ? "rounded-xl border border-emerald-500/25 bg-emerald-500/12 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
              : "rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          }
        >
          {feedbackMessage.text}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="pb-2">
            <CardDescription>Teams tracked</CardDescription>
            <CardTitle className="text-3xl">{data.teams.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="pb-2">
            <CardDescription>Athletes in organization</CardDescription>
            <CardTitle className="text-3xl">{athleteCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="pb-2">
            <CardDescription>Pending invitations</CardDescription>
            <CardTitle className="text-3xl">
              {pendingInvitations.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-md shadow-black/10">
          <CardHeader className="pb-2">
            <CardDescription>Roster entries</CardDescription>
            <CardTitle className="text-3xl">
              {data.teamMembers.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Team participation</CardTitle>
          <CardDescription>
            Snapshot of staffing and athlete coverage across teams.
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
                    Members: {team.memberCount} • Athletes: {team.athleteCount}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No team data yet. Add teams and memberships in the admin
              interface.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Compliance snapshot</CardTitle>
          <CardDescription>
            Workout assignment and completion metrics will appear here in the
            next phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
            <p className="text-sm font-medium">Workout assignment coverage</p>
            <p className="text-xs text-muted-foreground">
              Coming soon: percent of athletes with assigned workouts this week.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
            <p className="text-sm font-medium">Completion compliance</p>
            <p className="text-xs text-muted-foreground">
              Coming soon: submitted results versus assigned workload by team.
            </p>
          </div>
        </CardContent>
      </Card>

      {canAccessAdmin ? (
        <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
          <CardHeader>
            <CardTitle className="text-2xl">Admin interface</CardTitle>
            <CardDescription>
              Manage teams, roles, invitations, and organization access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/app/admin"
              className="inline-flex h-10 items-center rounded-md border border-border/80 bg-background px-4 text-sm font-medium hover:bg-accent/40"
            >
              Open admin interface
            </a>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
