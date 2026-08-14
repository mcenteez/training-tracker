import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import type { TrainingLoadSummary as TrainingLoadSummaryData } from "@/modules/assignments/db/training-load-queries";

interface TrainingLoadSummaryProps {
  summary: TrainingLoadSummaryData;
  label: string;
  drilldownBaseHref?: string;
}

export function TrainingLoadSummary({
  summary,
  label,
  drilldownBaseHref,
}: TrainingLoadSummaryProps) {
  return (
    <section aria-labelledby={`${label}-heading`} className="space-y-3">
      <div>
        <h2 id={`${label}-heading`} className="text-xl font-semibold">
          Training load
        </h2>
        <p className="text-sm text-muted-foreground">
          Descriptive totals from submitted sessions in this window. No athlete
          rankings or universal thresholds are applied.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">Capture coverage</dt>
            <dd className="text-2xl font-semibold">
              {summary.internalLoadAvailableCount} of {summary.sessionCount}
            </dd>
            <CardDescription>
              Submitted sessions with both duration and RPE;{" "}
              {summary.notCapturedCount} not captured
            </CardDescription>
            {drilldownBaseHref ? (
              <Link
                href={`${drilldownBaseHref}&metric=capture&tab=all`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                View capture facts
              </Link>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Internal load total
            </dt>
            <dd className="text-2xl font-semibold">
              {summary.totalInternalLoad}
            </dd>
            <CardDescription>
              {summary.totalDurationMinutes} recorded minutes across{" "}
              {summary.internalLoadAvailableCount} eligible sessions
            </CardDescription>
            {drilldownBaseHref ? (
              <Link
                href={`${drilldownBaseHref}&metric=internalLoad&tab=all`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                View internal load facts
              </Link>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <dt className="text-sm text-muted-foreground">
              Measurable strength volume
            </dt>
            <dd className="text-2xl font-semibold">
              {summary.totalCompletedVolumeKg.toFixed(1)} kg
            </dd>
            <CardDescription>
              {summary.externalWorkComparableCount} comparable ·{" "}
              {summary.externalWorkPartialCount} partial ·{" "}
              {summary.externalWorkUnavailableCount} unavailable sessions
            </CardDescription>
            {drilldownBaseHref ? (
              <Link
                href={`${drilldownBaseHref}&metric=externalWork&tab=all`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                View external work facts
              </Link>
            ) : null}
          </CardHeader>
        </Card>
      </dl>
    </section>
  );
}
