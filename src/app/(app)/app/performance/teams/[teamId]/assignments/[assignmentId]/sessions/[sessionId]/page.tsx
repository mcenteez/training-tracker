import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadAuthorizedTeamContext } from "@/lib/team-context";
import { hasPermission } from "@/modules/access-control/permissions";
import { findStaffSessionResultDetail } from "@/modules/assignments/db/staff-session-result-queries";

import { StaffSessionCommentForm } from "./comment-form";

interface StaffSessionResultPageProps {
  params: Promise<{ teamId: string; assignmentId: string; sessionId: string }>;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatMetric(result: {
  reps: number | null;
  load: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}): string {
  const metrics = [
    result.reps === null ? null : `${result.reps} reps`,
    result.load,
    result.durationSeconds === null ? null : `${result.durationSeconds}s`,
    result.distanceMeters === null ? null : `${result.distanceMeters}m`,
  ].filter(Boolean);
  return metrics.join(" - ") || "No numeric result";
}

function formatPrescription(prescription: {
  reps: number | null;
  load: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
}): string {
  return (
    [
      prescription.reps === null ? null : `${prescription.reps} reps`,
      prescription.load,
      prescription.durationSeconds === null
        ? null
        : `${prescription.durationSeconds}s duration`,
      prescription.distanceMeters === null
        ? null
        : `${prescription.distanceMeters}m`,
      prescription.restSeconds === null
        ? null
        : `${prescription.restSeconds}s rest`,
      prescription.tempo === null ? null : `tempo ${prescription.tempo}`,
    ]
      .filter(Boolean)
      .join(" - ") || "No numeric prescription"
  );
}

export default async function StaffSessionResultPage({
  params,
}: StaffSessionResultPageProps) {
  const { teamId, assignmentId, sessionId } = await params;
  const context = await loadAuthorizedTeamContext(teamId, "results.read.all");
  const session = await withDatabase((database) =>
    findStaffSessionResultDetail(database, {
      organizationId: context.membership.organizationId,
      teamId,
      assignmentId,
      sessionId,
    }),
  );

  if (!session) notFound();

  const canComment = hasPermission(context.access, "results.comment");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <section className="space-y-2">
        <Link
          href={`/app/performance/teams/${teamId}/assignments/${assignmentId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to assignment results
        </Link>
        <h1 className="text-3xl font-semibold">{session.athleteName}</h1>
        <p className="text-sm text-muted-foreground">
          {session.workoutName} - scheduled {session.scheduledDate} -{" "}
          {session.submittedAt
            ? `completed ${formatDateTime(session.submittedAt)}`
            : session.startedAt
              ? `started ${formatDateTime(session.startedAt)}`
              : "started"}
        </p>
      </section>

      <section
        aria-labelledby="effective-prescription-heading"
        className="space-y-4"
      >
        <div>
          <h2
            id="effective-prescription-heading"
            className="text-xl font-semibold"
          >
            Effective prescription used
          </h2>
          <p className="text-sm text-muted-foreground">
            Locked when this session started. Later individual changes do not
            alter it.
          </p>
        </div>
        <div className="divide-y rounded-md border bg-card">
          {session.prescriptions.map((prescription) => (
            <div
              key={prescription.itemSnapshotId}
              className="space-y-1 px-4 py-3 text-sm"
            >
              <p className="font-medium">{prescription.exerciseName}</p>
              <p>{formatPrescription(prescription)}</p>
              {prescription.notes ? (
                <p className="text-muted-foreground">{prescription.notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="submitted-results-heading"
        className="space-y-4"
      >
        <div>
          <h2 id="submitted-results-heading" className="text-xl font-semibold">
            {session.status === "submitted"
              ? "Completed results"
              : "Saved progress"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Recorded exercise metrics in workout order.
          </p>
        </div>
        {session.results.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No recorded metrics</CardTitle>
              <CardDescription>
                This completed session does not contain exercise result entries.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Exercise
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Round
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Result
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {session.results.map((result) => (
                  <tr key={`${result.itemSnapshotId}-${result.roundNumber}`}>
                    <th scope="row" className="px-4 py-3 font-medium">
                      {result.exerciseName}
                      {result.blockLabel ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {result.blockLabel}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-4 py-3">{result.roundNumber}</td>
                    <td className="px-4 py-3">{formatMetric(result)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {result.notes || "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Staff comments</CardTitle>
          <CardDescription>
            Operational notes from authorized coaching staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {session.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No staff comments yet.
            </p>
          ) : (
            <ol className="divide-y" aria-label="Staff comments">
              {session.comments.map((comment) => (
                <li key={comment.id} className="space-y-1 py-4 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{comment.authorName}</p>
                    <time
                      dateTime={comment.createdAt.toISOString()}
                      className="text-xs text-muted-foreground"
                    >
                      {formatDateTime(comment.createdAt)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                </li>
              ))}
            </ol>
          )}
          {canComment ? (
            <StaffSessionCommentForm
              teamId={teamId}
              assignmentId={assignmentId}
              sessionId={sessionId}
            />
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
