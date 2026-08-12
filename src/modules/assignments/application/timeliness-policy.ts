import { addDays, compareDates, mondayOf } from "./schedule-dates";

export interface TimelinessPolicy {
  version: 1;
  effectiveAt: Date;
  fixedDueLocalMinute: number;
  weeklyDueDay: number;
  weeklyDueLocalMinute: number;
  lateEntryDays: number;
}

export interface MetricWindow {
  startAt: Date;
  endAt: Date;
}

export interface EquivalentMetricWindows {
  current: MetricWindow;
  previous: MetricWindow;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveLocalDateTimeAtMinute(
  date: string,
  localMinute: number,
  timezone: string,
): Date {
  if (!isValidIanaTimezone(timezone)) {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const normalizedDate = addDays(date, Math.floor(localMinute / 1440));
  const normalizedMinute = localMinute % 1440;
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const hour = Math.floor(normalizedMinute / 60);
  const minute = normalizedMinute % 60;
  const targetTime = Date.UTC(year!, month! - 1, day!, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidateTime = targetTime;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidateTime))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjustment = targetTime - representedTime;

    candidateTime += adjustment;
    if (adjustment === 0) return new Date(candidateTime);
  }

  throw new RangeError(
    `Local deadline ${normalizedDate} ${hour}:${minute} does not resolve in ${timezone}`,
  );
}

export function resolveOccurrenceDueAt(input: {
  scheduledDate: string;
  scheduleType: "fixed" | "weekly_frequency";
  timezone: string;
  policy: TimelinessPolicy;
  effectiveEndDate?: string | null;
}): Date | null {
  if (
    input.effectiveEndDate &&
    compareDates(input.scheduledDate, input.effectiveEndDate) > 0
  ) {
    return null;
  }

  if (input.scheduleType === "fixed") {
    return resolveLocalDateTimeAtMinute(
      input.scheduledDate,
      input.policy.fixedDueLocalMinute,
      input.timezone,
    );
  }

  const weekStart = mondayOf(input.scheduledDate);
  const weeklyDueDate = addDays(weekStart, input.policy.weeklyDueDay - 1);
  return resolveLocalDateTimeAtMinute(
    weeklyDueDate,
    input.policy.weeklyDueLocalMinute,
    input.timezone,
  );
}

export function resolveLateEntryUntil(input: {
  dueAt: Date;
  timezone: string;
  lateEntryDays: number;
}): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(input.dueAt)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const localDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const localMinute = parts.hour * 60 + parts.minute;

  return resolveLocalDateTimeAtMinute(
    addDays(localDate, input.lateEntryDays),
    localMinute,
    input.timezone,
  );
}

export function isSubmissionOnTime(input: {
  submittedAt: Date;
  dueAt: Date;
}): boolean {
  return input.submittedAt < input.dueAt;
}

export function resolveEquivalentMetricWindows(input: {
  asOf: Date;
  windowDays: 30 | 90 | null;
}): EquivalentMetricWindows | null {
  if (input.windowDays === null) return null;

  const windowMilliseconds = input.windowDays * 24 * 60 * 60 * 1000;
  const currentStart = new Date(input.asOf.getTime() - windowMilliseconds);

  return {
    current: { startAt: currentStart, endAt: input.asOf },
    previous: {
      startAt: new Date(currentStart.getTime() - windowMilliseconds),
      endAt: currentStart,
    },
  };
}
