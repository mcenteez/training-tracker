import "server-only";

import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { exercises } from "@/modules/exercises/db/schema";
import {
  workoutBlocks,
  workoutItems,
  workouts,
  type Workout,
  type WorkoutBlock,
  type WorkoutItem,
  type WorkoutStatus,
} from "@/modules/workouts/db/schema";

export interface WorkoutListItem extends Workout {
  blockCount: number;
  itemCount: number;
}

export async function listWorkoutsForOrganization(
  database: Database,
  input: {
    organizationId: string;
    search?: string;
    status?: WorkoutStatus;
  },
): Promise<WorkoutListItem[]> {
  const conditions = [eq(workouts.organizationId, input.organizationId)];
  if (input.search?.trim()) {
    conditions.push(ilike(workouts.name, `%${input.search.trim()}%`));
  }
  if (input.status) conditions.push(eq(workouts.status, input.status));

  return database
    .select({
      id: workouts.id,
      organizationId: workouts.organizationId,
      sourceWorkoutId: workouts.sourceWorkoutId,
      name: workouts.name,
      description: workouts.description,
      status: workouts.status,
      archivedAt: workouts.archivedAt,
      version: workouts.version,
      createdByUserId: workouts.createdByUserId,
      updatedByUserId: workouts.updatedByUserId,
      createdAt: workouts.createdAt,
      updatedAt: workouts.updatedAt,
      blockCount: sql<number>`(
        SELECT count(*)::int FROM ${workoutBlocks}
        WHERE ${workoutBlocks.workoutId} = ${workouts.id}
      )`,
      itemCount: sql<number>`(
        SELECT count(*)::int FROM ${workoutItems}
        WHERE ${workoutItems.workoutId} = ${workouts.id}
      )`,
    })
    .from(workouts)
    .where(and(...conditions))
    .orderBy(asc(workouts.name), desc(workouts.updatedAt));
}

export interface WorkoutItemDetail extends WorkoutItem {
  exerciseName: string;
  exerciseStatus: "active" | "archived";
}

export interface WorkoutBlockDetail extends WorkoutBlock {
  items: WorkoutItemDetail[];
}

export interface WorkoutDetail extends Workout {
  blocks: WorkoutBlockDetail[];
}

export async function findWorkoutWithStructure(
  database: Database,
  input: { organizationId: string; workoutId: string },
): Promise<WorkoutDetail | null> {
  const [workout] = await database
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.organizationId, input.organizationId),
        eq(workouts.id, input.workoutId),
      ),
    )
    .limit(1);
  if (!workout) return null;

  const blocks = await database
    .select()
    .from(workoutBlocks)
    .where(
      and(
        eq(workoutBlocks.organizationId, input.organizationId),
        eq(workoutBlocks.workoutId, input.workoutId),
      ),
    )
    .orderBy(asc(workoutBlocks.position));
  const items = await database
    .select({
      id: workoutItems.id,
      organizationId: workoutItems.organizationId,
      workoutId: workoutItems.workoutId,
      blockId: workoutItems.blockId,
      exerciseId: workoutItems.exerciseId,
      position: workoutItems.position,
      reps: workoutItems.reps,
      load: workoutItems.load,
      loadValue: workoutItems.loadValue,
      loadUnit: workoutItems.loadUnit,
      normalizedLoadKg: workoutItems.normalizedLoadKg,
      durationSeconds: workoutItems.durationSeconds,
      distanceMeters: workoutItems.distanceMeters,
      restSeconds: workoutItems.restSeconds,
      tempo: workoutItems.tempo,
      notes: workoutItems.notes,
      exerciseName: exercises.name,
      exerciseStatus: exercises.status,
    })
    .from(workoutItems)
    .innerJoin(
      exercises,
      and(
        eq(exercises.organizationId, workoutItems.organizationId),
        eq(exercises.id, workoutItems.exerciseId),
      ),
    )
    .where(
      and(
        eq(workoutItems.organizationId, input.organizationId),
        eq(workoutItems.workoutId, input.workoutId),
      ),
    )
    .orderBy(asc(workoutItems.position));

  return {
    ...workout,
    blocks: blocks.map((block) => ({
      ...block,
      items: items.filter((item) => item.blockId === block.id),
    })),
  };
}
