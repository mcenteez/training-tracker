import { z } from "zod";

import { workoutBlockTypes } from "@/modules/workouts/db/schema";
import { resistanceSchema } from "@/modules/resistance/application/resistance";

export const workoutItemInputSchema = z
  .object({
    exerciseId: z.uuid(),
    reps: z.number().int().nonnegative().nullable(),
    load: z.string().trim().max(80).nullable(),
    resistance: resistanceSchema.nullable().optional(),
    durationSeconds: z.number().int().nonnegative().nullable(),
    distanceMeters: z.number().int().nonnegative().nullable(),
    restSeconds: z.number().int().nonnegative().nullable(),
    tempo: z.string().trim().max(40).nullable(),
    notes: z.string().trim().max(1000).nullable(),
  })
  .refine(
    (item) =>
      item.reps !== null ||
      Boolean(item.load) ||
      (item.resistance !== undefined && item.resistance !== null) ||
      item.durationSeconds !== null ||
      item.distanceMeters !== null ||
      item.restSeconds !== null ||
      Boolean(item.tempo) ||
      Boolean(item.notes),
    { message: "Add a prescription or coaching note." },
  );

export const workoutBlockInputSchema = z.object({
  type: z.enum(workoutBlockTypes),
  label: z.string().trim().max(120).nullable(),
  rounds: z.number().int().positive().max(100),
  items: z.array(workoutItemInputSchema).max(50),
});

export const workoutGraphInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable(),
  blocks: z.array(workoutBlockInputSchema).max(30),
});

export const updateWorkoutGraphInputSchema = workoutGraphInputSchema.extend({
  workoutId: z.uuid(),
  version: z.number().int().positive(),
});

export type WorkoutGraphInput = z.infer<typeof workoutGraphInputSchema>;
export type WorkoutBlockInput = z.infer<typeof workoutBlockInputSchema>;
