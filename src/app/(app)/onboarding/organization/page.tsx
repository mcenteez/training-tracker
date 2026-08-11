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
import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import { listOrganizationMembershipsForUser } from "@/modules/organizations/db/queries";

import { createOrganizationAction } from "./actions";

type OrganizationOnboardingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getErrorMessage(
  errorValue: string | string[] | undefined,
): string | null {
  if (Array.isArray(errorValue)) {
    return getErrorMessage(errorValue[0]);
  }

  if (errorValue === "invalid_name") {
    return "Enter an organization name between 2 and 120 characters.";
  }

  if (errorValue === "missing_email") {
    return "We could not read your account email address. Sign out and try again.";
  }

  return null;
}

export default async function OrganizationOnboardingPage({
  searchParams,
}: OrganizationOnboardingPageProps) {
  const user = await loadAuthenticatedUser();
  const memberships = await withDatabase((database) =>
    listOrganizationMembershipsForUser(database, user.id),
  );

  if (memberships.length > 0) {
    redirect("/app");
  }

  const params = await searchParams;
  const errorMessage = getErrorMessage(params.error);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <Card className="border-primary/20 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Onboarding
          </div>
          <CardTitle className="text-3xl tracking-tight">
            Create your organization
          </CardTitle>
          <CardDescription>
            Start by creating the organization that will own your teams,
            athletes, and workouts.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            action={createOrganizationAction}
            className="space-y-4 rounded-xl border border-border/70 bg-background/65 p-4"
          >
            <div className="space-y-2">
              <label
                htmlFor="organizationName"
                className="block text-sm font-medium text-foreground"
              >
                Organization name
              </label>
              <Input
                id="organizationName"
                name="organizationName"
                type="text"
                placeholder="North High Performance"
                required
                minLength={2}
                maxLength={120}
                className="h-10"
              />
            </div>

            {errorMessage ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="h-10 min-w-44">
              Create organization
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
