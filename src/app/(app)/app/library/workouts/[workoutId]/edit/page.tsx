import { notFound, redirect } from "next/navigation";

import { updateWorkoutAction } from "@/app/(app)/app/library/actions";
import { LibraryGlossary } from "@/components/library/library-glossary";
import { WorkoutBuilder } from "@/components/library/workout-builder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { listExercisesForOrganization } from "@/modules/exercises/db/queries";
import { findWorkoutWithStructure } from "@/modules/workouts/db/queries";

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const context = await loadLibraryAppContext();
  if (context.libraryAccess !== "manage") redirect("/app/library/workouts");
  const { workoutId } = await params;
  const [workout, activeExercises] = await withDatabase(async (database) =>
    Promise.all([
      findWorkoutWithStructure(database, {
        organizationId: context.membership.organizationId,
        workoutId,
      }),
      listExercisesForOrganization(database, {
        organizationId: context.membership.organizationId,
        filters: { status: "active" },
      }),
    ]),
  );
  if (!workout) notFound();
  if (workout.status === "archived")
    redirect("/app/library/workouts?status=archived");
  const exerciseOptions = new Map(
    activeExercises.map((exercise) => [
      exercise.id,
      { id: exercise.id, name: exercise.name, status: exercise.status },
    ]),
  );
  for (const item of workout.blocks.flatMap((block) => block.items))
    exerciseOptions.set(item.exerciseId, {
      id: item.exerciseId,
      name: item.exerciseName,
      status: item.exerciseStatus,
    });
  const builderWorkout = {
    id: workout.id,
    name: workout.name,
    description: workout.description,
    version: workout.version,
    blocks: workout.blocks.map((block) => ({
      type: block.type,
      label: block.label,
      rounds: block.rounds,
      items: block.items.map((item) => ({
        exerciseId: item.exerciseId,
        reps: item.reps,
        load: item.load,
        durationSeconds: item.durationSeconds,
        distanceMeters: item.distanceMeters,
        restSeconds: item.restSeconds,
        tempo: item.tempo,
        notes: item.notes,
      })),
    })),
  };

  return (
    <div className="space-y-5 py-7">
      <LibraryGlossary />
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Edit workout</CardTitle>
          <CardDescription>
            Update this session template and its training blocks while keeping
            plan-level scheduling as a separate layer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkoutBuilder
            action={updateWorkoutAction}
            exercises={[...exerciseOptions.values()]}
            workout={builderWorkout}
          />
        </CardContent>
      </Card>
    </div>
  );
}
