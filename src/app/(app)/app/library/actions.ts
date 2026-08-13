"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  exerciseInputSchema,
  exerciseLifecycleInputSchema,
  updateExerciseInputSchema,
} from "@/modules/exercises/application/exercise-input";
import {
  archiveExercise,
  createExercise,
  restoreExercise,
  updateExercise,
} from "@/modules/exercises/application/exercise-service";
import { createExerciseUnitOfWork } from "@/modules/exercises/db/unit-of-work";
import {
  planInputSchema,
  updatePlanInputSchema,
} from "@/modules/plans/application/plan-input";
import {
  archivePlan,
  createPlan,
  duplicatePlan,
  restorePlan,
  savePlan,
} from "@/modules/plans/application/plan-service";
import { createPlanUnitOfWork } from "@/modules/plans/db/unit-of-work";
import {
  workoutGraphInputSchema,
  updateWorkoutGraphInputSchema,
} from "@/modules/workouts/application/workout-input";
import {
  archiveWorkout,
  createWorkout,
  duplicateWorkout,
  restoreWorkout,
  saveWorkout,
} from "@/modules/workouts/application/workout-service";
import { createWorkoutUnitOfWork } from "@/modules/workouts/db/unit-of-work";

export interface ExerciseActionState {
  message?: string;
  errors?: Record<string, string[]>;
}

function parseExerciseFormData(formData: FormData) {
  return {
    name: formData.get("name"),
    instructions: formData.get("instructions"),
    category: formData.get("category"),
    equipment: String(formData.get("equipment") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    videoUrl: formData.get("videoUrl"),
  };
}

function expectedExerciseError(error: unknown): ExerciseActionState | null {
  if (error instanceof DomainInvariantError) {
    return { message: error.message };
  }

  if (
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError
  ) {
    return { message: "You cannot modify this exercise." };
  }

  return null;
}

export async function createExerciseAction(
  _previousState: ExerciseActionState,
  formData: FormData,
): Promise<ExerciseActionState> {
  const parsed = exerciseInputSchema.safeParse(parseExerciseFormData(formData));

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const context = await loadLibraryAppContext();

  try {
    await withDatabase((database) =>
      createExercise(createExerciseUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        exercise: parsed.data,
      }),
    );
  } catch (error) {
    const expected = expectedExerciseError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/exercises");
  redirect("/app/library/exercises?created=1");
}

export async function updateExerciseAction(
  _previousState: ExerciseActionState,
  formData: FormData,
): Promise<ExerciseActionState> {
  const parsed = updateExerciseInputSchema.safeParse({
    ...parseExerciseFormData(formData),
    exerciseId: formData.get("exerciseId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const context = await loadLibraryAppContext();

  try {
    await withDatabase((database) =>
      updateExercise(createExerciseUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        exerciseId: parsed.data.exerciseId,
        expectedVersion: parsed.data.version,
        exercise: parsed.data,
      }),
    );
  } catch (error) {
    const expected = expectedExerciseError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/exercises");
  redirect("/app/library/exercises?updated=1");
}

async function changeExerciseStatusAction(
  formData: FormData,
  operation: typeof archiveExercise,
  success: string,
): Promise<void> {
  const parsed = exerciseLifecycleInputSchema.safeParse({
    exerciseId: formData.get("exerciseId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) {
    redirect("/app/library/exercises?error=invalid_exercise");
  }

  const context = await loadLibraryAppContext();

  try {
    await withDatabase((database) =>
      operation(createExerciseUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        exerciseId: parsed.data.exerciseId,
        expectedVersion: parsed.data.version,
      }),
    );
  } catch (error) {
    if (expectedExerciseError(error)) {
      redirect("/app/library/exercises?error=exercise_conflict");
    }
    throw error;
  }

  revalidatePath("/app/library/exercises");
  redirect(`/app/library/exercises?${success}=1`);
}

export async function archiveExerciseAction(formData: FormData): Promise<void> {
  return changeExerciseStatusAction(formData, archiveExercise, "archived");
}

export async function restoreExerciseAction(formData: FormData): Promise<void> {
  return changeExerciseStatusAction(formData, restoreExercise, "restored");
}

export interface WorkoutActionState {
  message?: string;
  errors?: Record<string, string[]>;
}

function parseWorkoutGraph(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("graph") ?? ""));
  } catch {
    return null;
  }
}

function expectedWorkoutError(error: unknown): WorkoutActionState | null {
  if (error instanceof DomainInvariantError) {
    return { message: error.message };
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError
  ) {
    return { message: "You cannot modify this workout." };
  }
  return null;
}

export async function createWorkoutAction(
  _previousState: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const parsed = workoutGraphInputSchema.safeParse(parseWorkoutGraph(formData));
  const status = formData.get("intent") === "activate" ? "active" : "draft";
  if (!parsed.success) {
    return {
      message:
        "Review the workout structure and complete the highlighted programming.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const context = await loadLibraryAppContext();
  let workoutId: string;
  try {
    const workout = await withDatabase((database) =>
      createWorkout(createWorkoutUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        graph: parsed.data,
        status,
      }),
    );
    workoutId = workout.id;
  } catch (error) {
    const expected = expectedWorkoutError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/workouts");
  redirect(`/app/library/workouts/${workoutId}?saved=1`);
}

export async function updateWorkoutAction(
  _previousState: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const graph = parseWorkoutGraph(formData);
  const parsed = updateWorkoutGraphInputSchema.safeParse({
    ...(typeof graph === "object" && graph ? graph : {}),
    workoutId: formData.get("workoutId"),
    version: Number(formData.get("version")),
  });
  const status = formData.get("intent") === "activate" ? "active" : "draft";
  if (!parsed.success) {
    return {
      message:
        "Review the workout structure and complete the highlighted programming.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const context = await loadLibraryAppContext();
  try {
    await withDatabase((database) =>
      saveWorkout(createWorkoutUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        workoutId: parsed.data.workoutId,
        expectedVersion: parsed.data.version,
        graph: parsed.data,
        status,
      }),
    );
  } catch (error) {
    const expected = expectedWorkoutError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/workouts");
  redirect(`/app/library/workouts/${parsed.data.workoutId}?saved=1`);
}

const workoutLifecycleSchema = exerciseLifecycleInputSchema.transform(
  (value) => ({
    workoutId: value.exerciseId,
    version: value.version,
  }),
);

export async function duplicateWorkoutAction(
  formData: FormData,
): Promise<void> {
  const workoutId = formData.get("workoutId");
  if (typeof workoutId !== "string") redirect("/app/library/workouts");
  const context = await loadLibraryAppContext();
  try {
    const duplicate = await withDatabase((database) =>
      duplicateWorkout(createWorkoutUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        workoutId,
      }),
    );
    revalidatePath("/app/library/workouts");
    redirect(`/app/library/workouts/${duplicate.id}/edit`);
  } catch (error) {
    if (expectedWorkoutError(error)) {
      redirect("/app/library/workouts?error=workout_conflict");
    }
    throw error;
  }
}

async function changeWorkoutStatusAction(
  formData: FormData,
  operation: typeof archiveWorkout,
  success: string,
): Promise<void> {
  const parsed = workoutLifecycleSchema.safeParse({
    exerciseId: formData.get("workoutId"),
    version: Number(formData.get("version")),
  });
  if (!parsed.success) redirect("/app/library/workouts?error=invalid_workout");
  const context = await loadLibraryAppContext();
  try {
    await withDatabase((database) =>
      operation(createWorkoutUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        workoutId: parsed.data.workoutId,
        expectedVersion: parsed.data.version,
      }),
    );
  } catch (error) {
    if (expectedWorkoutError(error)) {
      redirect("/app/library/workouts?error=workout_conflict");
    }
    throw error;
  }
  revalidatePath("/app/library/workouts");
  redirect(`/app/library/workouts?${success}=1`);
}

export async function archiveWorkoutAction(formData: FormData): Promise<void> {
  return changeWorkoutStatusAction(formData, archiveWorkout, "archived");
}

export async function restoreWorkoutAction(formData: FormData): Promise<void> {
  return changeWorkoutStatusAction(formData, restoreWorkout, "restored");
}

export interface PlanActionState {
  message?: string;
  errors?: Record<string, string[]>;
}

function parsePlanGraph(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("graph") ?? ""));
  } catch {
    return null;
  }
}

function expectedPlanError(error: unknown): PlanActionState | null {
  if (error instanceof DomainInvariantError) {
    return { message: error.message };
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof ResourceNotFoundError
  ) {
    return { message: "You cannot modify this plan." };
  }
  return null;
}

export async function createPlanAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = planInputSchema.safeParse(parsePlanGraph(formData));
  const status = formData.get("intent") === "activate" ? "active" : "draft";
  const activateReferencedDraftWorkouts =
    formData.get("activateReferencedDraftWorkouts") === "1";
  if (!parsed.success) {
    return {
      message:
        "Review the plan schedule and complete the highlighted programming.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const context = await loadLibraryAppContext();
  let planId: string;
  try {
    const plan = await withDatabase((database) =>
      createPlan(createPlanUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        plan: parsed.data,
        status,
        activateReferencedDraftWorkouts,
      }),
    );
    planId = plan.id;
  } catch (error) {
    const expected = expectedPlanError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/plans");
  revalidatePath("/app/library/workouts");
  redirect(`/app/library/plans/${planId}?saved=1`);
}

export async function updatePlanAction(
  _previousState: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const graph = parsePlanGraph(formData);
  const parsed = updatePlanInputSchema.safeParse({
    ...(typeof graph === "object" && graph ? graph : {}),
    planId: formData.get("planId"),
    version: Number(formData.get("version")),
  });
  const status = formData.get("intent") === "activate" ? "active" : "draft";
  const activateReferencedDraftWorkouts =
    formData.get("activateReferencedDraftWorkouts") === "1";
  if (!parsed.success) {
    return {
      message:
        "Review the plan schedule and complete the highlighted programming.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const context = await loadLibraryAppContext();
  try {
    await withDatabase((database) =>
      savePlan(createPlanUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        planId: parsed.data.planId,
        expectedVersion: parsed.data.version,
        plan: parsed.data,
        status,
        activateReferencedDraftWorkouts,
      }),
    );
  } catch (error) {
    const expected = expectedPlanError(error);
    if (expected) return expected;
    throw error;
  }

  revalidatePath("/app/library/plans");
  revalidatePath("/app/library/workouts");
  redirect(`/app/library/plans/${parsed.data.planId}?saved=1`);
}

const planLifecycleSchema = exerciseLifecycleInputSchema.transform((value) => ({
  planId: value.exerciseId,
  version: value.version,
}));

export async function duplicatePlanAction(formData: FormData): Promise<void> {
  const planId = formData.get("planId");
  if (typeof planId !== "string") redirect("/app/library/plans");
  const context = await loadLibraryAppContext();
  try {
    const duplicate = await withDatabase((database) =>
      duplicatePlan(createPlanUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        planId,
      }),
    );
    revalidatePath("/app/library/plans");
    redirect(`/app/library/plans/${duplicate.id}/edit`);
  } catch (error) {
    if (expectedPlanError(error)) {
      redirect("/app/library/plans?error=plan_conflict");
    }
    throw error;
  }
}

async function changePlanStatusAction(
  formData: FormData,
  operation: typeof archivePlan,
  success: string,
): Promise<void> {
  const parsed = planLifecycleSchema.safeParse({
    exerciseId: formData.get("planId"),
    version: Number(formData.get("version")),
  });
  if (!parsed.success) redirect("/app/library/plans?error=invalid_plan");
  const context = await loadLibraryAppContext();

  try {
    await withDatabase((database) =>
      operation(createPlanUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        planId: parsed.data.planId,
        expectedVersion: parsed.data.version,
      }),
    );
  } catch (error) {
    if (expectedPlanError(error)) {
      redirect("/app/library/plans?error=plan_conflict");
    }
    throw error;
  }

  revalidatePath("/app/library/plans");
  redirect(`/app/library/plans?${success}=1`);
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  return changePlanStatusAction(formData, archivePlan, "archived");
}

export async function restorePlanAction(formData: FormData): Promise<void> {
  return changePlanStatusAction(formData, restorePlan, "restored");
}
