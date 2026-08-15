import { z } from "zod";

import { prescriptionOverrideFields } from "./effective-prescription";

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

export const athletePrescriptionOverrideFormSchema = z
  .object({
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
    if (
      input.overriddenFields.includes("load") &&
      (input.loadValue === null) !== (input.loadUnit === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["loadValue"],
        message: "Enter both a numeric load and its unit.",
      });
    }
  });

export const clearAthletePrescriptionFormSchema = z.object({
  assignmentId: z.uuid(),
  recipientId: z.uuid(),
  athleteUserId: z.uuid(),
  itemSnapshotId: z.uuid(),
  planSlotSnapshotId: z.uuid().nullable(),
  expectedVersion: z.coerce.number().int().positive(),
});

export function athletePrescriptionFormData(formData: FormData) {
  return {
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
  };
}
