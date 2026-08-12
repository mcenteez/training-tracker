import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { getAuthenticationEntryPath } from "@/lib/auth/config";
import { getAuthenticatedIdentity } from "@/lib/auth/identity";
import { findTeamInvitationPreviewByToken } from "@/modules/teams/db/queries";

import { acceptTeamInvitationAction } from "./actions";

interface AcceptTeamInvitePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function AcceptTeamInvitePage({
  params,
  searchParams,
}: AcceptTeamInvitePageProps) {
  const identity = await getAuthenticatedIdentity();
  const { token } = await params;
  const feedback = await searchParams;

  if (!identity) {
    redirect(getAuthenticationEntryPath(`/accept-team-invite/${token}`));
  }

  const invitation = await withDatabase((database) =>
    findTeamInvitationPreviewByToken(database, token),
  );
  const canAccept =
    invitation?.isUsable === true && feedback.error !== "invite_unavailable";

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-2xl items-center justify-center px-5 py-8 sm:px-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Team invitation</CardTitle>
          <CardDescription>
            {canAccept
              ? `Join ${invitation.teamName} with the Team ${invitation.role} role.`
              : "This invitation is unavailable."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {canAccept ? (
            <p>
              Accepting adds you to this team. Existing organization access is
              not changed; new organization members receive Athlete access.
            </p>
          ) : (
            <p>
              The link may be invalid, expired, revoked, already used, or for a
              different account.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex items-center gap-2">
          {canAccept ? (
            <form action={acceptTeamInvitationAction.bind(null, token)}>
              <Button type="submit">Accept invitation</Button>
            </form>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/app">Return to app</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
