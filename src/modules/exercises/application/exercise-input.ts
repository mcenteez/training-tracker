import { z } from "zod";

import { exerciseCategories } from "@/modules/exercises/db/schema";

const optionalText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => value || null);

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  instructions: optionalText(4000),
  category: z.enum(exerciseCategories),
  equipment: z
    .array(z.string().trim().min(1).max(80))
    .max(20)
    .transform((items) => [
      ...new Set(items.map((item) => item.toLowerCase())),
    ]),
  videoUrl: z
    .union([z.url().max(500), z.literal("")])
    .transform((value) => value || null),
});

export const updateExerciseInputSchema = exerciseInputSchema.extend({
  exerciseId: z.uuid(),
  version: z.number().int().positive(),
});

export const exerciseLifecycleInputSchema = z.object({
  exerciseId: z.uuid(),
  version: z.number().int().positive(),
});

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
