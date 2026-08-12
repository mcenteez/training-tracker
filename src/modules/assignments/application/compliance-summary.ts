export interface ComplianceCounts {
  completed: number;
  overdue: number;
  started: number;
  dueToday: number;
  upcoming: number;
}

export interface AthleteComplianceInput {
  athleteUserId: string;
  counts: ComplianceCounts;
  overdueDates?: readonly string[];
}

export interface ComplianceSummary {
  counts: ComplianceCounts;
  eligibleDue: number;
  completionRate: number | null;
  outstandingRate: number | null;
  athletesNeedingAttention: number;
  programmedAthletes: number;
  rosteredAthletes: number;
  athleteCoverage: number | null;
  engagedAthletes: number;
  athletesWithEligibleDue: number;
  engagementRate: number | null;
  oldestOverdueDate: string | null;
}

export function emptyComplianceCounts(): ComplianceCounts {
  return {
    completed: 0,
    overdue: 0,
    started: 0,
    dueToday: 0,
    upcoming: 0,
  };
}

function mergeCounts(target: ComplianceCounts, source: ComplianceCounts): void {
  target.completed += source.completed;
  target.overdue += source.overdue;
  target.started += source.started;
  target.dueToday += source.dueToday;
  target.upcoming += source.upcoming;
}

function eligibleDue(counts: ComplianceCounts): number {
  return counts.completed + counts.overdue + counts.started + counts.dueToday;
}

export function buildComplianceSummary(input: {
  athletes: readonly AthleteComplianceInput[];
  rosteredAthleteIds?: readonly string[];
}): ComplianceSummary {
  const counts = emptyComplianceCounts();
  const athleteCounts = new Map<string, ComplianceCounts>();
  let oldestOverdueDate: string | null = null;

  for (const athlete of input.athletes) {
    mergeCounts(counts, athlete.counts);
    const aggregate =
      athleteCounts.get(athlete.athleteUserId) ?? emptyComplianceCounts();
    mergeCounts(aggregate, athlete.counts);
    athleteCounts.set(athlete.athleteUserId, aggregate);

    for (const date of athlete.overdueDates ?? []) {
      if (oldestOverdueDate === null || date < oldestOverdueDate) {
        oldestOverdueDate = date;
      }
    }
  }

  const athletes = [...athleteCounts.values()];
  const athletesWithEligibleDue = athletes.filter(
    (athlete) => eligibleDue(athlete) > 0,
  ).length;
  const engagedAthletes = athletes.filter(
    (athlete) => athlete.started > 0 || athlete.completed > 0,
  ).length;
  const athletesNeedingAttention = athletes.filter(
    (athlete) => athlete.overdue > 0,
  ).length;
  const programmedAthletes = athletesWithEligibleDue;
  const rosteredAthletes = new Set(input.rosteredAthleteIds ?? []).size;
  const due = eligibleDue(counts);

  return {
    counts,
    eligibleDue: due,
    completionRate: due === 0 ? null : counts.completed / due,
    outstandingRate:
      due === 0
        ? null
        : (counts.overdue + counts.started + counts.dueToday) / due,
    athletesNeedingAttention,
    programmedAthletes,
    rosteredAthletes,
    athleteCoverage:
      rosteredAthletes === 0 ? null : programmedAthletes / rosteredAthletes,
    engagedAthletes,
    athletesWithEligibleDue,
    engagementRate:
      athletesWithEligibleDue === 0
        ? null
        : engagedAthletes / athletesWithEligibleDue,
    oldestOverdueDate,
  };
}
