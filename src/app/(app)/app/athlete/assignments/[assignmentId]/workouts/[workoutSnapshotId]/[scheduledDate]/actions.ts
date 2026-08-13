"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  resetAssignmentSession,
  autosaveAssignmentSessionResults,
  startAssignmentSession,
  submitAssignmentSession,
} from "@/modules/assignments/application/assignment-session-service";
import { parseAssignmentSessionCapture } from "@/modules/assignments/application/session-form";
import { createAssignmentSessionUnitOfWork } from "@/modules/assignments/db/session-unit-of-work";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";

async function ensureAthleteContext() {
  const context = await loadActiveAppContext();

  if (context.membership.organizationRole !== "athlete") {
    throw new AuthorizationError();
  }

  return context;
}

interface OccurrenceRef {
  assignmentId: string;
  workoutSnapshotId: string;
  scheduledDate: string;
}

function occurrenceUrl(ref: OccurrenceRef, query: string): string {
  return `/app/athlete/assignments/${ref.assignmentId}/workouts/${ref.workoutSnapshotId}/${ref.scheduledDate}${query}`;
}

function parseOccurrenceRef(formData: FormData): OccurrenceRef {
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const workoutSnapshotId = String(
    formData.get("workoutSnapshotId") ?? "",
  ).trim();
  const scheduledDate = String(formData.get("scheduledDate") ?? "").trim();

  if (
    !assignmentId ||
    !workoutSnapshotId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)
  ) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  return { assignmentId, workoutSnapshotId, scheduledDate };
}

function expectedActionError(error: unknown, ref: OccurrenceRef): never {
  if (
    error instanceof AuthorizationError ||
    error instanceof DomainInvariantError ||
    error instanceof ResourceNotFoundError
  ) {
    redirect(occurrenceUrl(ref, `?error=${sessionErrorReason(error)}`));
  }

  throw error;
}

function sessionErrorReason(error: Error): string {
  const message = error.message.toLowerCase();

  if (message.includes("weekly target")) return "weekly_target_met";
  if (message.includes("current week")) return "outside_week";
  if (message.includes("different day")) return "wrong_weekday";
  if (message.includes("outside the assignment schedule"))
    return "outside_schedule";
  if (message.includes("late-entry window")) return "late_entry_closed";
  if (message.includes("not available to start")) return "not_yet_available";
  if (message.includes("submitted")) return "already_submitted";
  if (message.includes("updated elsewhere")) return "version_conflict";
  if (
    message.includes("valid whole number") ||
    message.includes("numeric load") ||
    message.includes("kilograms or pounds") ||
    message.includes("enter both") ||
    message.includes("too small") ||
    message.includes("too big")
  )
    return "invalid_session_load";

  return "assignment_session_action_failed";
}

function revalidateOccurrence(ref: OccurrenceRef): void {
  revalidatePath(`/app/athlete/assignments/${ref.assignmentId}`);
  revalidatePath(occurrenceUrl(ref, ""));
}

export async function startWorkoutOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();
  const ref = parseOccurrenceRef(formData);
  const planSlotSnapshotId =
    String(formData.get("planSlotSnapshotId") ?? "").trim() || null;

  try {
    await withDatabase((database) =>
      startAssignmentSession(createAssignmentSessionUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        assignmentId: ref.assignmentId,
        athleteUserId: context.user.id,
        planSlotSnapshotId,
        scheduledDate: planSlotSnapshotId ? ref.scheduledDate : null,
      }),
    );
  } catch (error) {
    expectedActionError(error, ref);
  }

  revalidateOccurrence(ref);
  redirect(occurrenceUrl(ref, "?started=1"));
}

export async function autosaveWorkoutOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();
  const ref = parseOccurrenceRef(formData);
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));
  const allowSubmittedEdit = formData.get("allowSubmittedEdit") === "1";

  if (!sessionId || !Number.isFinite(expectedVersion)) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  try {
    const capture = parseAssignmentSessionCapture(formData);
    await withDatabase((database) =>
      autosaveAssignmentSessionResults(
        createAssignmentSessionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          assignmentId: ref.assignmentId,
          athleteUserId: context.user.id,
          sessionId,
          expectedVersion,
          mutationId: crypto.randomUUID(),
          results: capture.results,
          durationMinutes: capture.durationMinutes,
          sessionRpe: capture.sessionRpe,
          allowSubmittedEdit,
        },
      ),
    );
  } catch (error) {
    expectedActionError(error, ref);
  }

  revalidateOccurrence(ref);
  redirect(occurrenceUrl(ref, "?saved=1"));
}

export async function submitWorkoutOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();
  const ref = parseOccurrenceRef(formData);
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));

  if (!sessionId || !Number.isFinite(expectedVersion)) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  try {
    const capture = parseAssignmentSessionCapture(formData);
    await withDatabase(async (database) => {
      const unitOfWork = createAssignmentSessionUnitOfWork(database);
      let finalVersion = expectedVersion;

      if (capture.results.length > 0 || capture.hasSessionResponseFields) {
        const saved = await autosaveAssignmentSessionResults(unitOfWork, {
          organizationId: context.membership.organizationId,
          assignmentId: ref.assignmentId,
          athleteUserId: context.user.id,
          sessionId,
          expectedVersion: finalVersion,
          mutationId: crypto.randomUUID(),
          results: capture.results,
          durationMinutes: capture.durationMinutes,
          sessionRpe: capture.sessionRpe,
        });

        finalVersion = saved.version;
      }

      await submitAssignmentSession(unitOfWork, {
        organizationId: context.membership.organizationId,
        assignmentId: ref.assignmentId,
        athleteUserId: context.user.id,
        sessionId,
        expectedVersion: finalVersion,
      });
    });
  } catch (error) {
    expectedActionError(error, ref);
  }

  revalidateOccurrence(ref);
  redirect(occurrenceUrl(ref, "?submitted=1"));
}

export async function resetWorkoutOccurrenceAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();
  const ref = parseOccurrenceRef(formData);
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));

  if (!sessionId || !Number.isFinite(expectedVersion)) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      resetAssignmentSession(createAssignmentSessionUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        assignmentId: ref.assignmentId,
        athleteUserId: context.user.id,
        sessionId,
        expectedVersion,
      }),
    );
  } catch (error) {
    expectedActionError(error, ref);
  }

  revalidateOccurrence(ref);
  redirect(occurrenceUrl(ref, "?reset=1"));
}
