"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  autosaveAssignmentSessionResults,
  startAssignmentSession,
  submitAssignmentSession,
} from "@/modules/assignments/application/assignment-session-service";
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

function assignmentUrl(assignmentId: string, query: string): string {
  return `/app/athlete/assignments/${assignmentId}${query}`;
}

function expectedActionError(error: unknown, assignmentId: string): never {
  if (
    error instanceof AuthorizationError ||
    error instanceof DomainInvariantError ||
    error instanceof ResourceNotFoundError
  ) {
    redirect(
      assignmentUrl(assignmentId, "?error=assignment_session_action_failed"),
    );
  }

  throw error;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.floor(numeric);
}

function parseOptionalText(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

export async function startAssignmentSessionAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!assignmentId) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      startAssignmentSession(createAssignmentSessionUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        assignmentId,
        athleteUserId: context.user.id,
      }),
    );
  } catch (error) {
    expectedActionError(error, assignmentId);
  }

  revalidatePath(`/app/athlete/assignments/${assignmentId}`);
  redirect(assignmentUrl(assignmentId, "?started=1"));
}

export async function autosaveAssignmentSessionAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));

  if (!assignmentId || !sessionId || !Number.isFinite(expectedVersion)) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  const itemSnapshotIds = formData
    .getAll("itemSnapshotIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const results = itemSnapshotIds
    .map((itemSnapshotId) => ({
      itemSnapshotId,
      roundNumber: 1,
      reps: parseOptionalInt(formData.get(`result:${itemSnapshotId}:reps`)),
      load: parseOptionalText(
        formData.get(`result:${itemSnapshotId}:load`),
        80,
      ),
      durationSeconds: parseOptionalInt(
        formData.get(`result:${itemSnapshotId}:durationSeconds`),
      ),
      distanceMeters: parseOptionalInt(
        formData.get(`result:${itemSnapshotId}:distanceMeters`),
      ),
      notes: parseOptionalText(
        formData.get(`result:${itemSnapshotId}:notes`),
        2000,
      ),
    }))
    .filter((result) =>
      [
        result.reps,
        result.load,
        result.durationSeconds,
        result.distanceMeters,
        result.notes,
      ].some((value) => value !== null),
    );

  try {
    await withDatabase((database) =>
      autosaveAssignmentSessionResults(
        createAssignmentSessionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          assignmentId,
          athleteUserId: context.user.id,
          sessionId,
          expectedVersion,
          mutationId: crypto.randomUUID(),
          results,
        },
      ),
    );
  } catch (error) {
    expectedActionError(error, assignmentId);
  }

  revalidatePath(`/app/athlete/assignments/${assignmentId}`);
  redirect(assignmentUrl(assignmentId, "?saved=1"));
}

export async function submitAssignmentSessionAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAthleteContext();

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));

  if (!assignmentId || !sessionId || !Number.isFinite(expectedVersion)) {
    redirect("/app/athlete?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      submitAssignmentSession(createAssignmentSessionUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        assignmentId,
        athleteUserId: context.user.id,
        sessionId,
        expectedVersion,
      }),
    );
  } catch (error) {
    expectedActionError(error, assignmentId);
  }

  revalidatePath(`/app/athlete/assignments/${assignmentId}`);
  redirect(assignmentUrl(assignmentId, "?submitted=1"));
}
