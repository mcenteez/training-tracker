import { z } from "zod";

import { exerciseCategories } from "@/modules/exercises/db/schema";
import {
  maxWeeklyFrequencyTarget,
  planDaysOfWeek,
} from "@/modules/plans/db/schema";
import { workoutBlockTypes } from "@/modules/workouts/db/schema";

import { libraryImportFormatVersion, libraryImportLimits } from "./format";

const optionalText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .nullish()
    .transform((value) => value || null);

const optionalCount = (maximum: number) =>
  z.number().int().nonnegative().max(maximum).nullish().default(null);

const entityName = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .meta({ description: "Unique within the organization, case-insensitive." });

export const importExerciseSchema = z
  .object({
    name: entityName,
    instructions: optionalText(4000),
    category: z.enum(exerciseCategories).default("other"),
    equipment: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .default([])
      .transform((items) => [
        ...new Set(items.map((item) => item.toLowerCase())),
      ]),
    videoUrl: z
      .union([z.url({ protocol: /^https?$/ }).max(500), z.literal("")])
      .nullish()
      .transform((value) => value || null)
      .meta({ description: "Must be an http or https URL." }),
  })
  .strict()
  .meta({ id: "ImportExercise", title: "Exercise" });

export const importWorkoutItemSchema = z
  .object({
    exercise: entityName.meta({
      description:
        "Name of an exercise defined in this file or already in the library.",
    }),
    reps: optionalCount(10_000),
    load: optionalText(80),
    durationSeconds: optionalCount(86_400),
    distanceMeters: optionalCount(1_000_000),
    restSeconds: optionalCount(86_400),
    tempo: optionalText(40),
    notes: optionalText(1000),
  })
  .strict()
  .refine(
    (item) =>
      item.reps !== null ||
      Boolean(item.load) ||
      item.durationSeconds !== null ||
      item.distanceMeters !== null ||
      item.restSeconds !== null ||
      Boolean(item.tempo) ||
      Boolean(item.notes),
    { message: "Add a prescription or coaching note." },
  )
  .meta({ id: "ImportWorkoutItem", title: "Workout item" });

export const importWorkoutBlockSchema = z
  .object({
    type: z.enum(workoutBlockTypes).default("straight"),
    label: optionalText(120),
    rounds: z.number().int().positive().max(100).default(1),
    items: z
      .array(importWorkoutItemSchema)
      .max(libraryImportLimits.itemsPerBlock),
  })
  .strict()
  .meta({ id: "ImportWorkoutBlock", title: "Workout block" });

export const importWorkoutSchema = z
  .object({
    name: entityName,
    description: optionalText(2000),
    blocks: z
      .array(importWorkoutBlockSchema)
      .max(libraryImportLimits.blocksPerWorkout),
  })
  .strict()
  .meta({ id: "ImportWorkout", title: "Workout" });

export const importPlanScheduleSlotSchema = z
  .discriminatedUnion("scheduleType", [
    z
      .object({
        scheduleType: z.literal("fixed_day"),
        workout: entityName.meta({
          description:
            "Name of a workout defined in this file or already in the library.",
        }),
        dayOfWeek: z.enum(planDaysOfWeek),
        label: optionalText(120),
      })
      .strict(),
    z
      .object({
        scheduleType: z.literal("weekly_frequency"),
        workout: entityName.meta({
          description:
            "Name of a workout defined in this file or already in the library.",
        }),
        targetSessionsPerWeek: z
          .number()
          .int()
          .positive()
          .max(maxWeeklyFrequencyTarget),
        label: optionalText(120),
      })
      .strict(),
  ])
  .meta({ id: "ImportPlanScheduleSlot", title: "Plan schedule slot" });

export const importPlanSchema = z
  .object({
    name: entityName,
    description: optionalText(2000),
    scheduleSlots: z
      .array(importPlanScheduleSlotSchema)
      .max(libraryImportLimits.scheduleSlotsPerPlan),
  })
  .strict()
  .meta({ id: "ImportPlan", title: "Plan" });

export const libraryImportBundleSchema = z
  .object({
    $schema: z.string().max(500).optional().meta({
      description: "Ignored. Present so editors can validate the file.",
    }),
    formatVersion: z.literal(libraryImportFormatVersion),
    exercises: z
      .array(importExerciseSchema)
      .max(libraryImportLimits.exercises)
      .default([]),
    workouts: z
      .array(importWorkoutSchema)
      .max(libraryImportLimits.workouts)
      .default([]),
    plans: z.array(importPlanSchema).max(libraryImportLimits.plans).default([]),
  })
  .strict()
  .refine(
    (bundle) =>
      bundle.exercises.length > 0 ||
      bundle.workouts.length > 0 ||
      bundle.plans.length > 0,
    { message: "Provide at least one exercise, workout, or plan." },
  )
  .meta({
    id: "LibraryImportBundle",
    title: "Training Tracker library import bundle",
  });

export type LibraryImportBundle = z.infer<typeof libraryImportBundleSchema>;
export type ImportExercise = z.infer<typeof importExerciseSchema>;
export type ImportWorkout = z.infer<typeof importWorkoutSchema>;
export type ImportPlan = z.infer<typeof importPlanSchema>;
export type ImportPlanScheduleSlot = z.infer<
  typeof importPlanScheduleSlotSchema
>;
