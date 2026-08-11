import { z } from "zod";

import {
  maxWeeklyFrequencyTarget,
  planDaysOfWeek,
} from "@/modules/plans/db/schema";

export const planScheduleSlotInputSchema = z.discriminatedUnion(
  "scheduleType",
  [
    z.object({
      scheduleType: z.literal("fixed_day"),
      workoutId: z.uuid(),
      dayOfWeek: z.enum(planDaysOfWeek),
      label: z.string().trim().max(120).nullable(),
    }),
    z.object({
      scheduleType: z.literal("weekly_frequency"),
      workoutId: z.uuid(),
      targetSessionsPerWeek: z
        .number()
        .int()
        .positive()
        .max(maxWeeklyFrequencyTarget),
      label: z.string().trim().max(120).nullable(),
    }),
  ],
);

export const planInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable(),
  scheduleSlots: z.array(planScheduleSlotInputSchema).max(300),
});

export const updatePlanInputSchema = planInputSchema.extend({
  planId: z.uuid(),
  version: z.number().int().positive(),
});

export const planLifecycleInputSchema = z.object({
  planId: z.uuid(),
  version: z.number().int().positive(),
});

export type PlanInput = z.infer<typeof planInputSchema>;
export type PlanScheduleSlotInput = z.infer<typeof planScheduleSlotInputSchema>;
