import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { findPublishedAssignmentForAthlete } from "@/modules/assignments/db/queries";

interface AthleteAssignmentDetailPageProps {
  params: Promise<{ assignmentId: string }>;
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AthleteAssignmentDetailPage({
  params,
}: AthleteAssignmentDetailPageProps) {
  const { assignmentId } = await params;
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    redirect("/app");
  }

  const assignment = await withDatabase((database) =>
    findPublishedAssignmentForAthlete(database, {
      organizationId: context.membership.organizationId,
      athleteUserId: context.user.id,
      assignmentId,
    }),
  );

  if (!assignment) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.sourceName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignment.sourceType === "plan" ? "Plan" : "Workout"} assignment
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/app/athlete">Back to dashboard</Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          {assignment.sourceType === "plan" ? (
            <>
              <p>Start: {assignment.startDate ?? "-"}</p>
              <p>End: {assignment.endDate ?? "-"}</p>
            </>
          ) : (
            <>
              <p>Scheduled: {assignment.scheduledDate ?? "-"}</p>
              <p>Timezone: {assignment.timezone}</p>
            </>
          )}
          <p>Available from: {formatDateTime(assignment.availableFrom)}</p>
          <p>Available until: {formatDateTime(assignment.availableUntil)}</p>
          <p>Published: {formatDateTime(assignment.publishedAt)}</p>
          <p>Recipients: {assignment.recipientCount}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workout Logging</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Session logging and autosave for assignment snapshots will be
            enabled in the next phase. This page now establishes athlete-safe
            assignment visibility and scheduling context.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
