import { redirect } from "next/navigation";

import { createWorkoutAction } from "@/app/(app)/app/library/actions";
import { WorkoutBuilder } from "@/components/library/workout-builder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="py-7">
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Create workout</CardTitle>
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
