import { Card, CardHeader } from "@/components/ui/card";
import type { TeamTimelinessDashboard } from "@/modules/assignments/db/team-compliance-queries";

function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(rate);
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "Unavailable";
  const hours = Math.max(0, Math.round(milliseconds / 3_600_000));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder === 0 ? `${days}d` : `${days}d ${remainder}h`;
}

function changeLabel(timeliness: TeamTimelinessDashboard): string {
  if (timeliness.trend === null) return "No all-time trend";
  const comparison = timeliness.trend.onTimeCompletion;
  if (comparison.unavailableReason) return "Insufficient history";
  const change = comparison.percentagePointChange!;
  const prefix = change > 0 ? "+" : "";
  return `${prefix}${change.toFixed(0)} points · ${comparison.direction}`;
}

export function TimelinessSummary({
  timeliness,
  label,
}: {
  timeliness: TeamTimelinessDashboard;
  label: string;
}) {
  const current = timeliness.current;
  const oldestAge = current.oldestOpenOverdueAt
    ? timeliness.asOf.getTime() - current.oldestOpenOverdueAt.getTime()
    : null;

  return (
    <dl
      role="group"
      aria-label={label}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Card>
        <CardHeader className="gap-1">
          <dt className="text-sm text-muted-foreground">On-time completion</dt>
          <dd className="font-heading text-2xl font-medium">
            {current.onTimeCompletionRate === null
              ? "No due work"
              : formatRate(current.onTimeCompletionRate)}
          </dd>
          <dd className="text-sm text-muted-foreground">
            {current.counts.onTimeCompleted} of {current.timelinessEligible} due
            occurrences
          </dd>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="gap-1">
          <dt className="text-sm text-muted-foreground">
            Equivalent-window change
          </dt>
          <dd className="font-heading text-2xl font-medium">
            {changeLabel(timeliness)}
          </dd>
          <dd className="text-sm text-muted-foreground">
            {timeliness.previous
              ? `${timeliness.previous.counts.onTimeCompleted}/${timeliness.previous.timelinessEligible} previously`
              : "All-time has no previous window"}
          </dd>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="gap-1">
          <dt className="text-sm text-muted-foreground">
            Average completed lateness
          </dt>
          <dd className="font-heading text-2xl font-medium">
            {current.averageCompletedLatenessMilliseconds === null
              ? "No late completions"
              : formatDuration(current.averageCompletedLatenessMilliseconds)}
          </dd>
          <dd className="text-sm text-muted-foreground">
            {current.counts.lateCompleted} completed late
          </dd>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="gap-1">
          <dt className="text-sm text-muted-foreground">Open overdue</dt>
          <dd className="font-heading text-2xl font-medium">
            {current.counts.openOverdue}
          </dd>
          <dd className="text-sm text-muted-foreground">
            {oldestAge === null
              ? "No open overdue work"
              : `Oldest ${formatDuration(oldestAge)}`}
          </dd>
        </CardHeader>
      </Card>
    </dl>
  );
}
