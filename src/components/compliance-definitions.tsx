interface ComplianceDefinitionsProps {
  windowLabel: string;
  showCoverage?: boolean;
}

export function ComplianceDefinitions({
  windowLabel,
  showCoverage = false,
}: ComplianceDefinitionsProps) {
  return (
    <section
      aria-labelledby="compliance-definitions-heading"
      className="space-y-3 border-t pt-4"
    >
      <h3 id="compliance-definitions-heading" className="text-sm font-semibold">
        Metric definitions
      </h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Completion rate</dt>
          <dd className="text-muted-foreground">
            Completed submissions divided by due work. A submission confirms
            logging, not verified training quality.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Due work</dt>
          <dd className="text-muted-foreground">
            Completed, overdue, started, and due-today occurrences in the{" "}
            {windowLabel} window. Upcoming work is excluded.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Overdue work</dt>
          <dd className="text-muted-foreground">
            An occurrence before today without a logged start or completed
            submission.
          </dd>
        </div>
        {showCoverage ? (
          <div>
            <dt className="font-medium">Programming coverage</dt>
            <dd className="text-muted-foreground">
              Unique organization athletes with due work divided by current
              organization athletes.
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium">Due instant</dt>
          <dd className="text-muted-foreground">
            End of the scheduled local day for fixed work, or end of Sunday for
            a weekly target, resolved in the assignment timezone.
          </dd>
        </div>
        <div>
          <dt className="font-medium">On-time completion</dt>
          <dd className="text-muted-foreground">
            The first completed submission occurred before the due instant. A
            submission exactly at the deadline is late.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Late and open overdue</dt>
          <dd className="text-muted-foreground">
            Completed late has a submission after the deadline. Open overdue has
            no completed submission. Late logging remains available for seven
            assignment-local calendar days.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Equivalent-window change</dt>
          <dd className="text-muted-foreground">
            The {windowLabel} rate minus the immediately preceding,
            non-overlapping window, shown in percentage points. All-time has no
            equivalent previous window.
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        No due work means the percentage is unavailable for this window, not
        100%. Insufficient history means one of the compared windows has no
        policy-eligible due work.
      </p>
    </section>
  );
}
