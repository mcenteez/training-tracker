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
import { findInvitationByToken } from "@/modules/organizations/db/queries";

import { acceptOrganizationInvitationAction } from "./actions";

type AcceptInvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isInviteUsable(status: string, expiresAt: Date): boolean {
  return status === "pending" && expiresAt.getTime() > Date.now();
}

function parseError(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  if (error === "invite_invalid") {
    return "This invite is invalid, expired, revoked, or already used.";
  }

  if (error === "missing_email") {
    return "Your account is missing a primary email address.";
  }

  return null;
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: AcceptInvitePageProps) {
  const identity = await getAuthenticatedIdentity();
  const { token } = await params;
  const query = await searchParams;

  if (!identity) {
    redirect(getAuthenticationEntryPath(`/accept-invite/${token}`));
  }

  const invitation = await withDatabase((database) =>
    findInvitationByToken(database, token),
  );

  const errorMessage = parseError(query);

  if (!invitation) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-2xl items-center justify-center px-5 py-8 sm:px-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>
              This invitation link is not valid.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline">
              <Link href="/app">Return to app</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const canAccept = isInviteUsable(invitation.status, invitation.expiresAt);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-2xl items-center justify-center px-5 py-8 sm:px-8">
      <Card className="w-full border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle>Organization invitation</CardTitle>
          <CardDescription>
            You were invited as{" "}
            <span className="font-medium">{invitation.role}</span> for
            <span className="font-medium"> {invitation.invitedEmail}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Status: {invitation.status}</p>
          <p>Expires: {invitation.expiresAt.toLocaleString()}</p>
          {errorMessage ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {!canAccept ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
              This invitation can no longer be accepted.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center gap-2">
          {canAccept ? (
            <form action={acceptOrganizationInvitationAction.bind(null, token)}>
              <Button type="submit">Accept invitation</Button>
            </form>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/app">Back to app</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
