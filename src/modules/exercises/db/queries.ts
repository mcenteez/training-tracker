import "server-only";

import { and, asc, desc, eq, ilike } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  exercises,
  type Exercise,
  type ExerciseStatus,
} from "@/modules/exercises/db/schema";

export interface ExerciseListFilters {
  search?: string;
  category?: Exercise["category"];
  status?: ExerciseStatus;
}

export async function listExercisesForOrganization(
  database: Database,
  input: { organizationId: string; filters?: ExerciseListFilters },
): Promise<Exercise[]> {
  const conditions = [eq(exercises.organizationId, input.organizationId)];
  const search = input.filters?.search?.trim();

  if (search) {
    conditions.push(ilike(exercises.name, `%${search}%`));
  }

  if (input.filters?.category) {
    conditions.push(eq(exercises.category, input.filters.category));
  }

  if (input.filters?.status) {
    conditions.push(eq(exercises.status, input.filters.status));
  }

  return database
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(asc(exercises.name), desc(exercises.updatedAt));
}

export async function findExerciseForOrganization(
  database: Database,
  input: { organizationId: string; exerciseId: string },
): Promise<Exercise | null> {
  const [exercise] = await database
    .select()
    .from(exercises)
    .where(
      and(
        eq(exercises.organizationId, input.organizationId),
        eq(exercises.id, input.exerciseId),
      ),
    )
    .limit(1);

  return exercise ?? null;
}
