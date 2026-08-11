import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { RemoveTeamMemberDialog } from "@/components/teams/remove-team-member-dialog";
import { UpdateTeamMemberRoleDialog } from "@/components/teams/update-team-member-role-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { withDatabase } from "@/db/client";
import { loadAuthorizedTeamContext } from "@/lib/team-context";
import { listTeamMembersByTeamId } from "@/modules/teams/db/queries";

import { addTeamMemberAction, updateTeamAction } from "./actions";

interface TeamOperationsDetailPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{
    updated?: string;
    memberSaved?: string;
    memberRemoved?: string;
    error?: string;
  }>;
}

export default async function TeamOperationsDetailPage({
  params,
  searchParams,
}: TeamOperationsDetailPageProps) {
  const { teamId } = await params;
  const feedback = await searchParams;
  const context = await loadAuthorizedTeamContext(teamId, "team.update");
  const members = await withDatabase((database) =>
    listTeamMembersByTeamId(database, {
      organizationId: context.membership.organizationId,
      teamId,
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/app/teams"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to team management
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {context.team.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {members.length} roster{" "}
            {members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/performance/teams/${teamId}`}>
            View performance
          </Link>
        </Button>
      </section>

      {feedback.updated === "1" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Team settings updated.
        </p>
      ) : null}
      {feedback.error === "team_update_unavailable" ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The team could not be updated. Refresh and try again.
        </p>
      ) : null}
      {feedback.memberSaved === "1" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Team member saved.
        </p>
      ) : null}
      {feedback.memberRemoved === "1" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Team member removed.
        </p>
      ) : null}
      {feedback.error === "member_not_found" ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No organization member was found for that email.
        </p>
      ) : null}
      {feedback.error === "member_update_unavailable" ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The roster could not be changed. Refresh and try again.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Team settings</CardTitle>
          <CardDescription>
            Update the name used throughout assignments and performance views.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateTeamAction} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />
            <div className="space-y-2">
              <label htmlFor="team-name" className="text-sm font-medium">
                Team name
              </label>
              <Input
                id="team-name"
                name="teamName"
                defaultValue={context.team.name}
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <PendingSubmitButton
              label="Save settings"
              pendingLabel="Saving settings"
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            Add existing organization members by exact email and manage Team
            roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            action={addTeamMemberAction}
            className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          >
            <input type="hidden" name="teamId" value={teamId} />
            <div className="space-y-2">
              <label htmlFor="member-email" className="text-sm font-medium">
                Organization member email
              </label>
              <Input
                id="member-email"
                name="email"
                type="email"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="new-member-role" className="text-sm font-medium">
                Team role
              </label>
              <select
                id="new-member-role"
                name="role"
                defaultValue="athlete"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="athlete">Athlete</option>
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <Button type="submit">Add member</Button>
          </form>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This team has no members yet.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="grid gap-3 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {member.fullName?.trim() || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <UpdateTeamMemberRoleDialog
                      teamId={teamId}
                      userId={member.userId}
                      displayName={member.fullName?.trim() || member.email}
                      currentRole={member.teamRole}
                      disabled={
                        member.userId === context.user.id &&
                        context.teamRole === "manager" &&
                        context.membership.organizationRole !== "owner" &&
                        context.membership.organizationRole !== "manager"
                      }
                    />
                    <RemoveTeamMemberDialog
                      teamId={teamId}
                      userId={member.userId}
                      displayName={member.fullName?.trim() || member.email}
                      disabled={
                        member.userId === context.user.id &&
                        context.teamRole === "manager" &&
                        context.membership.organizationRole !== "owner" &&
                        context.membership.organizationRole !== "manager"
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
