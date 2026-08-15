import { z } from "zod";

import { isValidIanaTimezone } from "./timeliness-policy";
import { resultResistanceSchema } from "@/modules/resistance/application/resistance";

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format");

const assignmentTargetInputSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("team"),
    teamId: z.uuid(),
  }),
  z.object({
    targetType: z.literal("athlete"),
    athleteUserId: z.uuid(),
  }),
]);

const planSourceInputSchema = z
  .object({
    sourceType: z.literal("plan"),
    sourcePlanId: z.uuid(),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine((input) => input.startDate <= input.endDate, {
    message: "Plan end date must be on or after start date.",
    path: ["endDate"],
  });

const workoutSourceInputSchema = z.object({
  sourceType: z.literal("workout"),
  sourceWorkoutId: z.uuid(),
  scheduledDate: dateStringSchema,
  availableFrom: z.iso.datetime({ offset: true }).nullable(),
  availableUntil: z.iso.datetime({ offset: true }).nullable(),
});

export const assignmentSourceInputSchema = z
  .discriminatedUnion("sourceType", [
    planSourceInputSchema,
    workoutSourceInputSchema,
  ])
  .refine(
    (input) =>
      input.sourceType === "plan" ||
      input.availableFrom === null ||
      input.availableUntil === null ||
      input.availableFrom < input.availableUntil,
    {
      message: "Workout availability end must be after availability start.",
      path: ["availableUntil"],
    },
  );

export const createAssignmentInputSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine(isValidIanaTimezone, "Use a valid IANA timezone"),
  source: assignmentSourceInputSchema,
  targets: z.array(assignmentTargetInputSchema).min(1).max(500),
});

export const updateAssignmentInputSchema = createAssignmentInputSchema.extend({
  assignmentId: z.uuid(),
  version: z.number().int().positive(),
});

const assignmentTransitionInputSchema = z.object({
  assignmentId: z.uuid(),
  version: z.number().int().positive(),
});

export const prepareAssignmentInputSchema = assignmentTransitionInputSchema;

export const publishAssignmentInputSchema = assignmentTransitionInputSchema;

export const returnAssignmentToDraftInputSchema =
  assignmentTransitionInputSchema;

export const cancelAssignmentInputSchema = z.object({
  assignmentId: z.uuid(),
  version: z.number().int().positive(),
});

export const autosaveSessionResultsInputSchema = z.object({
  sessionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  mutationId: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  sessionRpe: z.number().int().min(1).max(10).nullable().optional(),
  results: z
    .array(
      z
        .object({
          itemSnapshotId: z.uuid(),
          completedAt: z.date(),
          roundNumber: z.number().int().positive(),
          reps: z.number().int().nonnegative().nullable(),
          load: z.string().trim().max(80).nullable(),
          loadValue: z.number().finite().positive().nullable().optional(),
          loadUnit: z.enum(["kg", "lb"]).nullable().optional(),
          resistance: resultResistanceSchema.nullable().optional(),
          durationSeconds: z.number().int().nonnegative().nullable(),
          distanceMeters: z.number().int().nonnegative().nullable(),
          notes: z.string().trim().max(2000).nullable(),
        })
        .superRefine((result, context) => {
          if ((result.loadValue == null) !== (result.loadUnit == null)) {
            context.addIssue({
              code: "custom",
              path: ["loadValue"],
              message: "Enter both a numeric load and its unit.",
            });
          }
        }),
    )
    .max(2000),
});

export const submitSessionResultsInputSchema = z.object({
  sessionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});

export const commentAssignmentSessionInputSchema = z.object({
  sessionId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
});

export type AssignmentTargetInput = z.infer<typeof assignmentTargetInputSchema>;
export type AssignmentSourceInput = z.infer<typeof assignmentSourceInputSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentInputSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentInputSchema>;
