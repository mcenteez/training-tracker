import Link from "next/link";
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
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  findOrganizationNameById,
  listOrganizationAuditEventsByOrganizationId,
  listOrganizationInvitationsByOrganizationId,
} from "@/modules/organizations/db/queries";
import {
  listOrganizationMembersByOrganizationId,
  listTeamMembersByOrganizationId,
  listTeamsByOrganizationId,
} from "@/modules/teams/db/queries";

import {
  addOrUpdateTeamMemberAction,
  createTeamAction,
  inviteOrganizationMemberAction,
  removeOrganizationMemberAction,
  removeTeamMemberAction,
  revokeOrganizationInvitationAction,
  transferOrganizationOwnershipAction,
  updateOrganizationMemberRoleAction,
} from "../actions";

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getUserDisplayName(user: {
  fullName: string | null;
  email: string;
}): string {
  return user.fullName?.trim() || user.email;
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

  if (inviteCreated === "1") {
    return { kind: "success", text: "Invitation created successfully." };
  }

  if (inviteRevoked === "1") {
    return { kind: "success", text: "Invitation revoked successfully." };
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const activeContext = await loadActiveAppContext();
  const userContext = {
    ...activeContext.user,
    hasOrganizationMembership: true,
    organizationId: activeContext.membership.organizationId,
    organizationRole: activeContext.membership.organizationRole,
  };

  const data = await withDatabase(async (database) => {
    const [
      teams,
      organizationMembers,
      teamMembers,
      invitations,
      auditEvents,
      organizationName,
    ] = await Promise.all([
      listTeamsByOrganizationId(
        database,
        activeContext.membership.organizationId,
      ),
      listOrganizationMembersByOrganizationId(
        database,
        activeContext.membership.organizationId,
      ),
      listTeamMembersByOrganizationId(
        database,
        activeContext.membership.organizationId,
      ),
      listOrganizationInvitationsByOrganizationId(
        database,
        activeContext.membership.organizationId,
      ),
      listOrganizationAuditEventsByOrganizationId(
        database,
        activeContext.membership.organizationId,
      ),
      findOrganizationNameById(
        database,
        activeContext.membership.organizationId,
      ),
    ]);

    return {
      userContext,
      organizationName,
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

  if (
    data.userContext.organizationRole !== "owner" &&
    data.userContext.organizationRole !== "manager"
  ) {
    redirect("/app?error=forbidden_admin");
  }

  const adminRole = data.userContext.organizationRole;

  const canCreateTeam = hasPermission(
    { organizationRole: adminRole },
    "team.create",
  );

  const canManageTeamMembers = (teamId: string): boolean => {
    const actorTeamRole =
      data.teamMembers.find(
        (member) =>
          member.teamId === teamId && member.userId === data.userContext.id,
      )?.teamRole ?? null;

    return hasPermission(
      {
        organizationRole: adminRole,
        teamRole: actorTeamRole,
      },
      "team.members.manage",
    );
  };

  const canManageInvitations = hasPermission(
    { organizationRole: adminRole },
    "organization.members.manage",
  );

  const ownershipTransferCandidates = data.organizationMembers.filter(
    (member) => member.organizationRole !== "owner",
  );

  const params = await searchParams;
  const feedbackMessage = getFeedbackMessage(params);
  const roleLabel = adminRole;
  const organizationName = data.organizationName ?? "Unknown organization";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Card className="border-primary/25 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Admin Interface
          </div>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            Operational controls
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Manage teams, memberships, roles, and invitation lifecycle.
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
                                      {getUserDisplayName(member)} (
                                      {member.organizationRole})
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
                                  {getUserDisplayName(member)} (
                                  {member.teamRole})
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
          <CardTitle className="text-2xl">Organization members</CardTitle>
          <CardDescription>
            Manage organization-level roles and membership access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5">
          {data.userContext.organizationRole === "owner" ? (
            <form
              action={transferOrganizationOwnershipAction}
              className="grid gap-3 rounded-xl border border-border/70 bg-background/65 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
            >
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  New owner
                </label>
                <Select name="newOwnerUserId" required>
                  <SelectTrigger
                    className="h-10 min-w-56"
                    disabled={ownershipTransferCandidates.length === 0}
                  >
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownershipTransferCandidates.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {getUserDisplayName(member)} ({member.organizationRole})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Previous owner role
                </label>
                <Select
                  name="previousOwnerRole"
                  defaultValue="manager"
                  required
                >
                  <SelectTrigger className="h-10 min-w-44">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="viewer">viewer</SelectItem>
                    <SelectItem value="athlete">athlete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-10 sm:min-w-44"
                disabled={ownershipTransferCandidates.length === 0}
              >
                Transfer ownership
              </Button>

              {ownershipTransferCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Add another member before transferring ownership.
                </p>
              ) : null}
            </form>
          ) : null}

          {data.organizationMembers.length > 0 ? (
            <ul className="space-y-2.5">
              {data.organizationMembers.map((member) => {
                const canManageMember =
                  canManageInvitations && member.organizationRole !== "owner";

                return (
                  <li
                    key={member.userId}
                    className="space-y-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm">{getUserDisplayName(member)}</p>
                        {member.fullName ? (
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {member.organizationRole}
                      </p>
                    </div>

                    {canManageMember ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <form
                          action={updateOrganizationMemberRoleAction}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={member.userId}
                          />
                          <Select
                            name="role"
                            defaultValue={member.organizationRole}
                          >
                            <SelectTrigger className="h-8 min-w-32">
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">manager</SelectItem>
                              <SelectItem value="viewer">viewer</SelectItem>
                              <SelectItem value="athlete">athlete</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button type="submit" size="xs" variant="outline">
                            Update role
                          </Button>
                        </form>

                        <form action={removeOrganizationMemberAction}>
                          <input
                            type="hidden"
                            name="userId"
                            value={member.userId}
                          />
                          <Button type="submit" size="xs" variant="outline">
                            Remove member
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Role changes for this member are restricted.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No organization members found.
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

      <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Audit trail</CardTitle>
          <CardDescription>
            Security-sensitive invitation and membership activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.auditEvents.length > 0 ? (
            <ul className="space-y-2.5">
              {data.auditEvents
                .slice(-20)
                .reverse()
                .map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground">
                      {event.occurredAt.toLocaleString()}
                    </p>
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="text-xs text-muted-foreground">
                      Actor: {event.actorUserId}
                      {event.targetUserId
                        ? ` • Target: ${event.targetUserId}`
                        : ""}
                    </p>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No audit events yet.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
