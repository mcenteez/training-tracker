import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { withDatabase } from "@/db/client";
import { hasPermission } from "@/modules/access-control/permissions";
import { listOrganizationInvitationsByOrganizationId } from "@/modules/organizations/db/queries";
import {
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";

import {
  addOrUpdateTeamMemberAction,
  createTeamAction,
  inviteOrganizationMemberAction,
  revokeOrganizationInvitationAction,
  removeTeamMemberAction,
} from "./actions";

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

  return null;
}

export default async function AppHomePage({ searchParams }: AppHomePageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);

  if (!email) {
    redirect("/sign-in");
  }

  const data = await withDatabase(async (database) => {
    const userContext = await getAuthenticatedUserContext(database, {
      clerkUserId: userId,
      email,
    });

    if (!userContext.organizationId) {
      return {
        userContext,
        teams: [],
        organizationMembers: [],
        teamMembers: [],
        invitations: [],
      };
    }

    const [teams, organizationMembers, teamMembers, invitations] =
      await Promise.all([
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
      ]);

    return {
      userContext,
      teams,
      organizationMembers,
      teamMembers,
      invitations,
    };
  });

  if (!data.userContext.hasOrganizationMembership) {
    redirect("/onboarding/organization");
  }

  const canCreateTeam =
    data.userContext.organizationRole !== null &&
    hasPermission(
      { organizationRole: data.userContext.organizationRole },
      "team.create",
    );

  const canManageTeamMembers = (teamId: string): boolean => {
    if (data.userContext.organizationRole === null) {
      return false;
    }

    const actorTeamRole =
      data.teamMembers.find(
        (member) =>
          member.teamId === teamId && member.userId === data.userContext.id,
      )?.teamRole ?? null;

    return hasPermission(
      {
        organizationRole: data.userContext.organizationRole,
        teamRole: actorTeamRole,
      },
      "team.members.manage",
    );
  };

  const canManageInvitations =
    data.userContext.organizationRole !== null &&
    hasPermission(
      { organizationRole: data.userContext.organizationRole },
      "organization.members.manage",
    );

  const params = await searchParams;
  const feedbackMessage = getFeedbackMessage(params);
  const roleLabel = data.userContext.organizationRole ?? "athlete";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Control Center
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Training Tracker
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Create teams, manage member access, and shape daily operations from
            one focused admin surface.
          </CardDescription>
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
          <CardTitle className="text-2xl">Teams</CardTitle>
          <CardDescription>
            Manage team structure and team-level member roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canCreateTeam ? (
            <form
              action={createTeamAction}
              className="grid gap-3 rounded-xl border border-border/70 bg-background/65 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            >
              <div className="space-y-2">
                <label
                  htmlFor="teamName"
                  className="block text-sm font-medium text-foreground"
                >
                  Team name
                </label>
                <Input
                  id="teamName"
                  name="teamName"
                  type="text"
                  placeholder="Varsity"
                  required
                  minLength={2}
                  maxLength={120}
                  className="h-10"
                />
              </div>
              <Button type="submit" size="lg" className="h-10 sm:min-w-36">
                Create team
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your role does not allow team creation.
            </p>
          )}

          {data.teams.length > 0 ? (
            <ul className="space-y-4">
              {data.teams.map((team) => (
                <li key={team.id}>
                  <Card
                    size="sm"
                    className="ring-1 ring-border/80 shadow-md shadow-black/10"
                  >
                    <CardHeader className="gap-1.5">
                      <CardTitle className="text-lg tracking-tight">
                        {team.name}
                      </CardTitle>
                      <CardDescription>
                        Configure members and roles for this team.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3.5">
                      {canManageTeamMembers(team.id) ? (
                        <form
                          action={addOrUpdateTeamMemberAction}
                          className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3"
                        >
                          <input type="hidden" name="teamId" value={team.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-muted-foreground">
                                Member
                              </label>
                              <Select name="userId" required>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select member" />
                                </SelectTrigger>
                                <SelectContent>
                                  {data.organizationMembers.map((member) => (
                                    <SelectItem
                                      key={member.userId}
                                      value={member.userId}
                                    >
                                      {member.email} ({member.organizationRole})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-xs font-medium text-muted-foreground">
                                Team role
                              </label>
                              <Select
                                name="role"
                                required
                                defaultValue="athlete"
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Choose role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manager">
                                    manager
                                  </SelectItem>
                                  <SelectItem value="viewer">viewer</SelectItem>
                                  <SelectItem value="athlete">
                                    athlete
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <Button type="submit" size="sm" className="min-w-36">
                            Save member role
                          </Button>
                        </form>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Your role does not allow member management for this
                          team.
                        </p>
                      )}

                      {(() => {
                        const members = data.teamMembers.filter(
                          (member) => member.teamId === team.id,
                        );

                        if (members.length === 0) {
                          return (
                            <p className="text-xs text-muted-foreground">
                              No members on this team yet.
                            </p>
                          );
                        }

                        return (
                          <ul className="space-y-2">
                            {members.map((member) => (
                              <li
                                key={`${team.id}:${member.userId}`}
                                className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5"
                              >
                                <span className="text-xs">
                                  {member.email} ({member.teamRole})
                                </span>

                                {canManageTeamMembers(team.id) ? (
                                  <form action={removeTeamMemberAction}>
                                    <input
                                      type="hidden"
                                      name="teamId"
                                      value={team.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="userId"
                                      value={member.userId}
                                    />
                                    <Button
                                      type="submit"
                                      size="xs"
                                      variant="outline"
                                    >
                                      Remove
                                    </Button>
                                  </form>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No teams yet. Create your first team to continue setup.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Invitations</CardTitle>
          <CardDescription>
            Invite organization members by email and role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canManageInvitations ? (
            <form
              action={inviteOrganizationMemberAction}
              className="grid gap-3 rounded-xl border border-border/70 bg-background/65 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
            >
              <div className="space-y-2">
                <label
                  htmlFor="invitedEmail"
                  className="block text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <Input
                  id="invitedEmail"
                  name="invitedEmail"
                  type="email"
                  placeholder="coach@school.edu"
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Role
                </label>
                <Select name="role" defaultValue="athlete" required>
                  <SelectTrigger className="h-10 min-w-36">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="viewer">viewer</SelectItem>
                    <SelectItem value="athlete">athlete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="lg" className="h-10 sm:min-w-36">
                Send invite
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your role does not allow invitation management.
            </p>
          )}

          {data.invitations.length > 0 ? (
            <ul className="space-y-2.5">
              {data.invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="space-y-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      {invitation.invitedEmail} ({invitation.role})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Expires {invitation.expiresAt.toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <Link
                      href={`/accept-invite/${invitation.token}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Accept link
                    </Link>
                    {canManageInvitations && invitation.status === "pending" ? (
                      <form action={revokeOrganizationInvitationAction}>
                        <input
                          type="hidden"
                          name="invitationId"
                          value={invitation.id}
                        />
                        <Button size="xs" variant="outline" type="submit">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
