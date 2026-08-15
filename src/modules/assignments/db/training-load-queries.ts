import "server-only";

import { and, eq, inArray, lte, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  buildIndividualInternalLoadBaseline,
  buildInternalLoadMetric,
  compareExternalWork,
  type ExternalWorkComparison,
  type InternalLoadBaseline,
  type InternalLoadMetric,
  type VolumeInput,
} from "@/modules/assignments/application/training-load";
import {
  addDays,
  toLocalDateString,
} from "@/modules/assignments/application/schedule-dates";
import { resolveLocalDateTimeAtMinute } from "@/modules/assignments/application/timeliness-policy";
import {
  assignments,
  assignmentRecipientTeamScopes,
  assignmentSessionEffectiveItemPrescriptions,
  assignmentSessionItemResults,
  assignmentSessions,
} from "@/modules/assignments/db/schema";

interface SubmittedSessionFact {
  id: string;
  organizationId: string;
  assignmentId: string;
  recipientId: string;
  athleteUserId: string;
  scheduledDate: string;
  timezone: string;
  durationMinutes: number | null;
  sessionRpe: number | null;
  submittedAt: Date;
}

export interface SessionTrainingLoadDetail extends SubmittedSessionFact {
  internalLoad: InternalLoadMetric;
  externalWork: ExternalWorkComparison;
  baseline: InternalLoadBaseline;
}

export interface TrainingLoadSummary {
  sessionCount: number;
  athleteCount: number;
  internalLoadAvailableCount: number;
  notCapturedCount: number;
  externalWorkComparableCount: number;
  externalWorkPartialCount: number;
  externalWorkUnavailableCount: number;
  insufficientHistoryCount: number;
  totalDurationMinutes: number;
  totalInternalLoad: number;
  totalPrescribedVolumeKg: number;
  totalCompletedVolumeKg: number;
}

function sessionWithinWindow(
  session: SubmittedSessionFact,
  asOf: Date,
  windowDays: number | null,
): boolean {
  const localAsOf = toLocalDateString(asOf, session.timezone);
  if (session.scheduledDate > localAsOf) return false;
  if (windowDays === null) return true;
  return session.scheduledDate >= addDays(localAsOf, -(windowDays - 1));
}

async function listOrganizationSubmittedSessions(
  database: Database,
  input: {
    organizationId: string;
    asOf: Date;
    athleteUserId?: string;
    assignmentId?: string;
  },
): Promise<SubmittedSessionFact[]> {
  const rows = await database
    .select({
      id: assignmentSessions.id,
      organizationId: assignmentSessions.organizationId,
      assignmentId: assignmentSessions.assignmentId,
      recipientId: assignmentSessions.recipientId,
      athleteUserId: assignmentSessions.athleteUserId,
      scheduledDate: assignmentSessions.scheduledDate,
      timezone: assignments.timezone,
      durationMinutes: assignmentSessions.durationMinutes,
      sessionRpe: assignmentSessions.sessionRpe,
      submittedAt: assignmentSessions.submittedAt,
    })
    .from(assignmentSessions)
    .innerJoin(
      assignments,
      and(
        eq(assignments.organizationId, assignmentSessions.organizationId),
        eq(assignments.id, assignmentSessions.assignmentId),
      ),
    )
    .where(
      and(
        eq(assignmentSessions.organizationId, input.organizationId),
        eq(assignmentSessions.status, "submitted"),
        lte(assignmentSessions.submittedAt, input.asOf),
        input.athleteUserId
          ? eq(assignmentSessions.athleteUserId, input.athleteUserId)
          : undefined,
        input.assignmentId
          ? eq(assignmentSessions.assignmentId, input.assignmentId)
          : undefined,
      ),
    );

  return rows.filter(
    (row): row is SubmittedSessionFact => row.submittedAt !== null,
  );
}

async function listTeamSubmittedSessions(
  database: Database,
  input: { organizationId: string; teamId: string; asOf: Date },
): Promise<SubmittedSessionFact[]> {
  const rows = await database
    .select({
      id: assignmentSessions.id,
      organizationId: assignmentSessions.organizationId,
      assignmentId: assignmentSessions.assignmentId,
      recipientId: assignmentSessions.recipientId,
      athleteUserId: assignmentSessions.athleteUserId,
      scheduledDate: assignmentSessions.scheduledDate,
      timezone: assignments.timezone,
      durationMinutes: assignmentSessions.durationMinutes,
      sessionRpe: assignmentSessions.sessionRpe,
      submittedAt: assignmentSessions.submittedAt,
    })
    .from(assignmentRecipientTeamScopes)
    .innerJoin(
      assignmentSessions,
      and(
        eq(
          assignmentSessions.organizationId,
          assignmentRecipientTeamScopes.organizationId,
        ),
        eq(
          assignmentSessions.assignmentId,
          assignmentRecipientTeamScopes.assignmentId,
        ),
        eq(
          assignmentSessions.recipientId,
          assignmentRecipientTeamScopes.recipientId,
        ),
      ),
    )
    .innerJoin(
      assignments,
      and(
        eq(assignments.organizationId, assignmentSessions.organizationId),
        eq(assignments.id, assignmentSessions.assignmentId),
      ),
    )
    .where(
      and(
        eq(assignmentRecipientTeamScopes.organizationId, input.organizationId),
        eq(assignmentRecipientTeamScopes.teamId, input.teamId),
        eq(assignmentSessions.status, "submitted"),
        lte(assignmentSessions.submittedAt, input.asOf),
      ),
    );

  return rows.filter(
    (row): row is SubmittedSessionFact => row.submittedAt !== null,
  );
}

async function buildSessionDetails(
  database: Database,
  sessions: readonly SubmittedSessionFact[],
): Promise<SessionTrainingLoadDetail[]> {
  if (sessions.length === 0) return [];
  const sessionIds = sessions.map((session) => session.id);
  const [prescriptions, results] = await Promise.all([
    database
      .select({
        sessionId: assignmentSessionEffectiveItemPrescriptions.sessionId,
        reps: assignmentSessionEffectiveItemPrescriptions.reps,
        resistanceType:
          assignmentSessionEffectiveItemPrescriptions.resistanceType,
        load: assignmentSessionEffectiveItemPrescriptions.load,
        normalizedLoadKg: sql<string | null>`CASE
            WHEN ${assignmentSessionEffectiveItemPrescriptions.resistanceType} = 'fixed_weight'
              THEN ${assignmentSessionEffectiveItemPrescriptions.normalizedResistanceKg}
            WHEN ${assignmentSessionEffectiveItemPrescriptions.resistanceType} IS NULL
              THEN ${assignmentSessionEffectiveItemPrescriptions.normalizedLoadKg}
            ELSE NULL
          END`,
      })
      .from(assignmentSessionEffectiveItemPrescriptions)
      .where(
        and(
          eq(
            assignmentSessionEffectiveItemPrescriptions.organizationId,
            sessions[0]!.organizationId,
          ),
          inArray(
            assignmentSessionEffectiveItemPrescriptions.sessionId,
            sessionIds,
          ),
        ),
      ),
    database
      .select({
        sessionId: assignmentSessionItemResults.sessionId,
        reps: assignmentSessionItemResults.reps,
        resistanceType: assignmentSessionItemResults.resistanceType,
        load: assignmentSessionItemResults.load,
        normalizedLoadKg: sql<string | null>`CASE
          WHEN ${assignmentSessionItemResults.resistanceType} = 'fixed_weight'
            THEN ${assignmentSessionItemResults.normalizedResistanceKg}
          WHEN ${assignmentSessionItemResults.resistanceType} IS NULL
            THEN ${assignmentSessionItemResults.normalizedLoadKg}
          ELSE NULL
        END`,
      })
      .from(assignmentSessionItemResults)
      .where(
        and(
          eq(
            assignmentSessionItemResults.organizationId,
            sessions[0]!.organizationId,
          ),
          inArray(assignmentSessionItemResults.sessionId, sessionIds),
        ),
      ),
  ]);

  const volumeRows = <
    Row extends {
      sessionId: string;
      reps: number | null;
      normalizedLoadKg: string | null;
      resistanceType: string | null;
      load: string | null;
    },
  >(
    rows: readonly Row[],
    sessionId: string,
  ): VolumeInput[] =>
    rows
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({
        reps: row.reps,
        normalizedLoadKg:
          row.normalizedLoadKg === null ? null : Number(row.normalizedLoadKg),
        unavailableReason:
          row.normalizedLoadKg !== null
            ? undefined
            : row.resistanceType === "percent_1rm"
              ? "relative_resistance"
              : row.resistanceType !== null
                ? "non_weight_resistance"
                : row.load
                  ? "legacy_resistance"
                  : "unmeasurable_external_work",
      }));

  return sessions.map((session) => {
    const currentScheduledAt = resolveLocalDateTimeAtMinute(
      session.scheduledDate,
      720,
      session.timezone,
    );
    return {
      ...session,
      internalLoad: buildInternalLoadMetric(
        session.durationMinutes,
        session.sessionRpe,
      ),
      externalWork: compareExternalWork({
        prescribed: volumeRows(prescriptions, session.id),
        completed: volumeRows(results, session.id),
      }),
      baseline: buildIndividualInternalLoadBaseline({
        currentSessionId: session.id,
        currentScheduledAt,
        currentDurationMinutes: session.durationMinutes,
        currentSessionRpe: session.sessionRpe,
        timeZone: session.timezone,
        sessions: sessions
          .filter(
            (candidate) => candidate.athleteUserId === session.athleteUserId,
          )
          .map((candidate) => ({
            sessionId: candidate.id,
            status: "submitted",
            scheduledAt: resolveLocalDateTimeAtMinute(
              candidate.scheduledDate,
              720,
              candidate.timezone,
            ),
            durationMinutes: candidate.durationMinutes,
            sessionRpe: candidate.sessionRpe,
          })),
      }),
    };
  });
}

function summarize(
  details: readonly SessionTrainingLoadDetail[],
): TrainingLoadSummary {
  return {
    sessionCount: details.length,
    athleteCount: new Set(details.map((detail) => detail.athleteUserId)).size,
    internalLoadAvailableCount: details.filter(
      (detail) => detail.internalLoad.state === "internalLoadAvailable",
    ).length,
    notCapturedCount: details.filter(
      (detail) => detail.internalLoad.state === "notCaptured",
    ).length,
    externalWorkComparableCount: details.filter(
      (detail) => detail.externalWork.state === "externalWorkComparable",
    ).length,
    externalWorkPartialCount: details.filter(
      (detail) => detail.externalWork.state === "externalWorkPartial",
    ).length,
    externalWorkUnavailableCount: details.filter(
      (detail) => detail.externalWork.state === "externalWorkUnavailable",
    ).length,
    insufficientHistoryCount: new Set(
      details
        .filter((detail) => detail.baseline.state === "insufficient_history")
        .map((detail) => detail.athleteUserId),
    ).size,
    totalDurationMinutes: details.reduce(
      (total, detail) => total + (detail.durationMinutes ?? 0),
      0,
    ),
    totalInternalLoad: details.reduce(
      (total, detail) => total + (detail.internalLoad.internalLoad ?? 0),
      0,
    ),
    totalPrescribedVolumeKg: details.reduce(
      (total, detail) => total + (detail.externalWork.prescribedVolumeKg ?? 0),
      0,
    ),
    totalCompletedVolumeKg: details.reduce(
      (total, detail) => total + (detail.externalWork.completedVolumeKg ?? 0),
      0,
    ),
  };
}

export async function listTeamTrainingLoadDetails(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    asOf: Date;
    windowDays: number | null;
  },
): Promise<SessionTrainingLoadDetail[]> {
  const sessions = (await listTeamSubmittedSessions(database, input)).filter(
    (session) => sessionWithinWindow(session, input.asOf, input.windowDays),
  );
  return buildSessionDetails(database, sessions);
}

export async function listOrganizationTrainingLoadDetails(
  database: Database,
  input: {
    organizationId: string;
    asOf: Date;
    windowDays: number | null;
  },
): Promise<SessionTrainingLoadDetail[]> {
  const sessions = (
    await listOrganizationSubmittedSessions(database, input)
  ).filter((session) =>
    sessionWithinWindow(session, input.asOf, input.windowDays),
  );
  return buildSessionDetails(database, sessions);
}

export async function findAthleteSessionTrainingLoad(
  database: Database,
  input: {
    organizationId: string;
    athleteUserId: string;
    assignmentId: string;
    sessionId: string;
    asOf: Date;
  },
): Promise<SessionTrainingLoadDetail | null> {
  const sessions = await listOrganizationSubmittedSessions(database, {
    organizationId: input.organizationId,
    athleteUserId: input.athleteUserId,
    asOf: input.asOf,
  });
  const target = sessions.find(
    (session) =>
      session.id === input.sessionId &&
      session.assignmentId === input.assignmentId,
  );
  if (!target) return null;
  return (
    (await buildSessionDetails(database, sessions)).find(
      (detail) => detail.id === input.sessionId,
    ) ?? null
  );
}

export async function findStaffSessionTrainingLoad(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    assignmentId: string;
    sessionId: string;
    asOf: Date;
  },
): Promise<SessionTrainingLoadDetail | null> {
  const sessions = await listTeamSubmittedSessions(database, input);
  const target = sessions.find(
    (session) =>
      session.id === input.sessionId &&
      session.assignmentId === input.assignmentId,
  );
  if (!target) return null;
  return (
    (await buildSessionDetails(database, sessions)).find(
      (detail) => detail.id === input.sessionId,
    ) ?? null
  );
}

export async function summarizeAthleteAssignmentTrainingLoad(
  database: Database,
  input: {
    organizationId: string;
    athleteUserId: string;
    assignmentId: string;
    asOf: Date;
    windowDays: number | null;
  },
): Promise<TrainingLoadSummary> {
  const sessions = await listOrganizationSubmittedSessions(database, {
    organizationId: input.organizationId,
    athleteUserId: input.athleteUserId,
    asOf: input.asOf,
  });
  const details = await buildSessionDetails(database, sessions);
  return summarize(
    details.filter(
      (detail) =>
        detail.assignmentId === input.assignmentId &&
        sessionWithinWindow(detail, input.asOf, input.windowDays),
    ),
  );
}

export async function summarizeTeamTrainingLoad(
  database: Database,
  input: {
    organizationId: string;
    teamId: string;
    asOf: Date;
    windowDays: number | null;
  },
): Promise<TrainingLoadSummary> {
  return summarize(await listTeamTrainingLoadDetails(database, input));
}

export async function summarizeOrganizationTrainingLoad(
  database: Database,
  input: {
    organizationId: string;
    asOf: Date;
    windowDays: number | null;
  },
): Promise<TrainingLoadSummary> {
  return summarize(await listOrganizationTrainingLoadDetails(database, input));
}
