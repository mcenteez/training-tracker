import "server-only";

import { and, asc, desc, eq, ilike } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  plans,
  planScheduleSlots,
  type Plan,
  type PlanScheduleSlot,
  type PlanStatus,
} from "@/modules/plans/db/schema";
import { workouts } from "@/modules/workouts/db/schema";

export interface PlanListItem extends Plan {
  scheduleSlotCount: number;
}

export async function listPlansForOrganization(
  database: Database,
  input: {
    organizationId: string;
    search?: string;
    status?: PlanStatus;
  },
): Promise<PlanListItem[]> {
  const conditions = [eq(plans.organizationId, input.organizationId)];
  if (input.search?.trim()) {
    conditions.push(ilike(plans.name, `%${input.search.trim()}%`));
  }
  if (input.status) {
    conditions.push(eq(plans.status, input.status));
  }

  const rows = await database
    .select()
    .from(plans)
    .where(and(...conditions))
    .orderBy(asc(plans.name), desc(plans.updatedAt));

  const counts = await database
    .select({
      planId: planScheduleSlots.planId,
      count: planScheduleSlots.id,
    })
    .from(planScheduleSlots)
    .where(eq(planScheduleSlots.organizationId, input.organizationId));

  const countByPlanId = new Map<string, number>();
  for (const row of counts) {
    countByPlanId.set(row.planId, (countByPlanId.get(row.planId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    scheduleSlotCount: countByPlanId.get(row.id) ?? 0,
  }));
}

export interface PlanScheduleSlotDetail extends PlanScheduleSlot {
  workoutName: string;
  workoutStatus: "draft" | "active" | "archived";
}

export interface PlanDetail extends Plan {
  scheduleSlots: PlanScheduleSlotDetail[];
}

export async function findPlanWithSchedule(
  database: Database,
  input: {
    organizationId: string;
    planId: string;
  },
): Promise<PlanDetail | null> {
  const [plan] = await database
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.organizationId, input.organizationId),
        eq(plans.id, input.planId),
      ),
    )
    .limit(1);
  if (!plan) return null;

  const scheduleSlots = await database
    .select({
      id: planScheduleSlots.id,
      organizationId: planScheduleSlots.organizationId,
      planId: planScheduleSlots.planId,
      workoutId: planScheduleSlots.workoutId,
      scheduleType: planScheduleSlots.scheduleType,
      dayOfWeek: planScheduleSlots.dayOfWeek,
      targetSessionsPerWeek: planScheduleSlots.targetSessionsPerWeek,
      position: planScheduleSlots.position,
      label: planScheduleSlots.label,
      workoutName: workouts.name,
      workoutStatus: workouts.status,
    })
    .from(planScheduleSlots)
    .innerJoin(
      workouts,
      and(
        eq(workouts.organizationId, planScheduleSlots.organizationId),
        eq(workouts.id, planScheduleSlots.workoutId),
      ),
    )
    .where(
      and(
        eq(planScheduleSlots.organizationId, input.organizationId),
        eq(planScheduleSlots.planId, input.planId),
      ),
    )
    .orderBy(asc(planScheduleSlots.position));

  return {
    ...plan,
    scheduleSlots,
  };
}
