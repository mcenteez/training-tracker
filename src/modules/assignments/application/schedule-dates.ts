import type { PlanDayOfWeek } from "@/modules/plans/db/schema";

const dayNames: readonly PlanDayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function parseDateParts(dateString: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  return { year, month, day };
}

export function toLocalDateString(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(instant);
}

export function addDays(dateString: string, days: number): string {
  const { year, month, day } = parseDateParts(dateString);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function weekdayOf(dateString: string): PlanDayOfWeek {
  const { year, month, day } = parseDateParts(dateString);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayNames[(utcDay + 6) % 7]!;
}

export function mondayOf(dateString: string): string {
  const offset = dayNames.indexOf(weekdayOf(dateString));
  return addDays(dateString, -offset);
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export interface WeekWindow {
  weekStart: string;
  weekEnd: string;
}

export function currentWeekWindow(now: Date, timeZone: string): WeekWindow {
  const today = toLocalDateString(now, timeZone);
  const weekStart = mondayOf(today);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export function listFixedDayDates(input: {
  dayOfWeek: PlanDayOfWeek;
  startDate: string;
  endDate: string;
}): string[] {
  if (compareDates(input.startDate, input.endDate) > 0) {
    return [];
  }

  const startOffset =
    (dayNames.indexOf(input.dayOfWeek) -
      dayNames.indexOf(weekdayOf(input.startDate)) +
      7) %
    7;
  const dates: string[] = [];

  for (
    let date = addDays(input.startDate, startOffset);
    compareDates(date, input.endDate) <= 0;
    date = addDays(date, 7)
  ) {
    dates.push(date);
  }

  return dates;
}
