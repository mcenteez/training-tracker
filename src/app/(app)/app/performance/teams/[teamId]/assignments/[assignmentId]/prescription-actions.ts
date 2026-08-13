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
  prescriptionOverrideFields,
  type PrescriptionOverrideField,
} from "@/modules/assignments/application/effective-prescription";
import { normalizeStrengthLoad } from "@/modules/assignments/application/training-load";
import { createAthletePrescriptionUnitOfWork } from "@/modules/assignments/db/athlete-prescription-unit-of-work";

const optionalInteger = z.preprocess(
  (value) => (value === "" || value === null ? null : Number(value)),
  z.number().int().nonnegative().nullable(),
);
const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    z.string().max(maxLength).nullable(),
  );

const overrideInputSchema = z
  .object({
    teamId: z.uuid(),
    assignmentId: z.uuid(),
    recipientId: z.uuid(),
    athleteUserId: z.uuid(),
    itemSnapshotId: z.uuid(),
    planSlotSnapshotId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive().nullable(),
    overriddenFields: z.array(z.enum(prescriptionOverrideFields)).min(1),
    reps: optionalInteger,
    load: optionalText(80),
    loadValue: z.preprocess(
      (value) => (value === "" || value === null ? null : Number(value)),
      z.number().finite().positive().nullable(),
    ),
    loadUnit: z.enum(["kg", "lb"]).nullable(),
    durationSeconds: optionalInteger,
    distanceMeters: optionalInteger,
    restSeconds: optionalInteger,
    tempo: optionalText(80),
    notes: optionalText(2000),
    reason: optionalText(500),
  })
  .superRefine((input, context) => {
    const overridesLoad = input.overriddenFields.includes("load");
    if (
      overridesLoad &&
      (input.loadValue === null) !== (input.loadUnit === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["loadValue"],
        message: "Enter both a numeric load and its unit.",
      });
    }
  });

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
  const parsed = overrideInputSchema.safeParse({
    teamId: formData.get("teamId"),
    assignmentId: formData.get("assignmentId"),
    recipientId: formData.get("recipientId"),
    athleteUserId: formData.get("athleteUserId"),
    itemSnapshotId: formData.get("itemSnapshotId"),
    planSlotSnapshotId: formData.get("planSlotSnapshotId") || null,
    expectedVersion: formData.get("expectedVersion")
      ? Number(formData.get("expectedVersion"))
      : null,
    overriddenFields: formData.getAll("overriddenFields"),
    reps: formData.get("reps"),
    load: formData.get("load"),
    loadValue: formData.get("loadValue"),
    loadUnit: formData.get("loadUnit") || null,
    durationSeconds: formData.get("durationSeconds"),
    distanceMeters: formData.get("distanceMeters"),
    restSeconds: formData.get("restSeconds"),
    tempo: formData.get("tempo"),
    notes: formData.get("notes"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
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
    if (status) redirect(feedbackPath(parsed.data, status));
    throw error;
  }

  revalidatePrescriptionPaths(parsed.data);
  redirect(feedbackPath(parsed.data, "saved"));
}

export async function clearAthletePrescriptionOverrideAction(
  formData: FormData,
): Promise<void> {
  const parsed = z
    .object({
      teamId: z.uuid(),
      assignmentId: z.uuid(),
      recipientId: z.uuid(),
      athleteUserId: z.uuid(),
      itemSnapshotId: z.uuid(),
      planSlotSnapshotId: z.uuid().nullable(),
      expectedVersion: z.coerce.number().int().positive(),
    })
    .parse({
      teamId: formData.get("teamId"),
      assignmentId: formData.get("assignmentId"),
      recipientId: formData.get("recipientId"),
      athleteUserId: formData.get("athleteUserId"),
      itemSnapshotId: formData.get("itemSnapshotId"),
      planSlotSnapshotId: formData.get("planSlotSnapshotId") || null,
      expectedVersion: formData.get("expectedVersion"),
    });
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
    if (status) redirect(feedbackPath(parsed, status));
    throw error;
  }

  revalidatePrescriptionPaths(parsed);
  redirect(feedbackPath(parsed, "cleared"));
}
