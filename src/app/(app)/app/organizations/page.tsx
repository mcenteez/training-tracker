import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import { listOrganizationMembershipsForUser } from "@/modules/organizations/db/queries";

import { selectOrganizationAction } from "./actions";

type OrganizationChooserPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationChooserPage({
  searchParams,
}: OrganizationChooserPageProps) {
  const user = await loadAuthenticatedUser();
  const memberships = await withDatabase((database) =>
    listOrganizationMembershipsForUser(database, user.id),
  );

  if (memberships.length === 0) {
    redirect("/onboarding/organization");
  }

  const params = await searchParams;
  const errorValue = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const errorMessage =
    errorValue === "forbidden_organization"
      ? "You do not have access to that organization."
      : errorValue === "invalid_organization"
        ? "Choose a valid organization."
        : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <Card className="border-primary/20 bg-linear-to-br from-card via-card to-accent/10 shadow-2xl shadow-black/20">
        <CardHeader className="gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Organization
          </div>
          <CardTitle className="text-3xl tracking-tight">
            Choose your workspace
          </CardTitle>
          <CardDescription>
            Your dashboard and permissions will be scoped to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <ul className="space-y-3">
            {memberships.map((membership) => (
              <li
                key={membership.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{membership.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {membership.organizationRole}
                  </p>
                </div>
                <form action={selectOrganizationAction}>
                  <input
                    type="hidden"
                    name="organizationId"
                    value={membership.organizationId}
                  />
                  <Button type="submit" variant="outline">
                    Open organization
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
