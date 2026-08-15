"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  clearAthletePrescriptionOverride,
  saveAthletePrescriptionOverride,
} from "@/modules/assignments/application/athlete-prescription-service";
import {
  athletePrescriptionFormData,
  athletePrescriptionOverrideFormSchema,
  clearAthletePrescriptionFormSchema,
} from "@/modules/assignments/application/athlete-prescription-input";
import { type PrescriptionOverrideField } from "@/modules/assignments/application/effective-prescription";
import { normalizeStrengthLoad } from "@/modules/assignments/application/training-load";
import { createAthletePrescriptionUnitOfWork } from "@/modules/assignments/db/athlete-prescription-unit-of-work";

function feedbackPath(
  input: { teamId: string; assignmentId: string },
  status: string,
) {
  return `/app/performance/teams/${input.teamId}/assignments/${input.assignmentId}?prescription=${status}`;
}

function mutationFailureStatus(error: unknown): string | null {
  if (
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError
  ) {
    return "failed";
  }
  if (error instanceof DomainInvariantError) {
    if (error.message.includes("updated elsewhere")) return "conflict";
    if (error.message.includes("Started or completed")) return "locked";
    return "failed";
  }
  return null;
}

function revalidatePrescriptionPaths(input: {
  teamId: string;
  assignmentId: string;
}): void {
  revalidatePath(
    `/app/performance/teams/${input.teamId}/assignments/${input.assignmentId}`,
  );
  revalidatePath(`/app/athlete/assignments/${input.assignmentId}`);
}

export async function saveAthletePrescriptionOverrideAction(
  formData: FormData,
): Promise<void> {
  const parsed = athletePrescriptionOverrideFormSchema.safeParse(
    athletePrescriptionFormData(formData),
  );
  const teamId = z.uuid().safeParse(formData.get("teamId"));

  if (!parsed.success || !teamId.success) {
    throw new Error("Prescription fields are invalid.");
  }

  const context = await loadActiveAppContext();
  const normalizedLoad = parsed.data.overriddenFields.includes("load")
    ? normalizeStrengthLoad(
        parsed.data.loadValue === null || parsed.data.loadUnit === null
          ? null
          : { value: parsed.data.loadValue, unit: parsed.data.loadUnit },
      )
    : null;

  try {
    await withDatabase((database) =>
      saveAthletePrescriptionOverride(
        createAthletePrescriptionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          actorUserId: context.user.id,
          assignmentId: parsed.data.assignmentId,
          recipientId: parsed.data.recipientId,
          athleteUserId: parsed.data.athleteUserId,
          itemSnapshotId: parsed.data.itemSnapshotId,
          planSlotSnapshotId: parsed.data.planSlotSnapshotId,
          expectedVersion: parsed.data.expectedVersion,
          overriddenFields: parsed.data
            .overriddenFields as PrescriptionOverrideField[],
          reps: parsed.data.reps,
          load: parsed.data.load,
          loadValue: normalizedLoad?.value.toString() ?? null,
          loadUnit: normalizedLoad?.unit ?? null,
          normalizedLoadKg: normalizedLoad?.normalizedKg.toString() ?? null,
          resistance: parsed.data.resistance,
          durationSeconds: parsed.data.durationSeconds,
          distanceMeters: parsed.data.distanceMeters,
          restSeconds: parsed.data.restSeconds,
          tempo: parsed.data.tempo,
          notes: parsed.data.notes,
          reason: parsed.data.reason,
        },
      ),
    );
  } catch (error) {
    const status = mutationFailureStatus(error);
    if (status)
      redirect(
        feedbackPath(
          { teamId: teamId.data, assignmentId: parsed.data.assignmentId },
          status,
        ),
      );
    throw error;
  }

  const pathInput = {
    teamId: teamId.data,
    assignmentId: parsed.data.assignmentId,
  };
  revalidatePrescriptionPaths(pathInput);
  redirect(feedbackPath(pathInput, "saved"));
}

export async function clearAthletePrescriptionOverrideAction(
  formData: FormData,
): Promise<void> {
  const parsed = clearAthletePrescriptionFormSchema.parse(
    athletePrescriptionFormData(formData),
  );
  const teamId = z.uuid().parse(formData.get("teamId"));
  const context = await loadActiveAppContext();

  try {
    await withDatabase((database) =>
      clearAthletePrescriptionOverride(
        createAthletePrescriptionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          actorUserId: context.user.id,
          assignmentId: parsed.assignmentId,
          recipientId: parsed.recipientId,
          athleteUserId: parsed.athleteUserId,
          itemSnapshotId: parsed.itemSnapshotId,
          planSlotSnapshotId: parsed.planSlotSnapshotId,
          expectedVersion: parsed.expectedVersion,
        },
      ),
    );
  } catch (error) {
    const status = mutationFailureStatus(error);
    if (status)
      redirect(
        feedbackPath({ teamId, assignmentId: parsed.assignmentId }, status),
      );
    throw error;
  }

  const pathInput = { teamId, assignmentId: parsed.assignmentId };
  revalidatePrescriptionPaths(pathInput);
  redirect(feedbackPath(pathInput, "cleared"));
}
