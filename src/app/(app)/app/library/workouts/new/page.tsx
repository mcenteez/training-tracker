import { redirect } from "next/navigation";

import { createWorkoutAction } from "@/app/(app)/app/library/actions";
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

export default async function NewWorkoutPage() {
  const context = await loadLibraryAppContext();
  if (context.libraryAccess !== "manage") redirect("/app/library/workouts");
  const exercises = await withDatabase((database) =>
    listExercisesForOrganization(database, {
      organizationId: context.membership.organizationId,
      filters: { status: "active" },
    }),
  );

  return (
    <div className="space-y-5 py-7">
      <LibraryGlossary />
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Create workout</CardTitle>
          <CardDescription>
            Build one session template by composing ordered training blocks and
            exercise prescriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkoutBuilder
            action={createWorkoutAction}
            exercises={exercises.map(({ id, name, status }) => ({
              id,
              name,
              status,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
