import { notFound, redirect } from "next/navigation";

import { updateExerciseAction } from "@/app/(app)/app/library/actions";
import { ExerciseForm } from "@/components/library/exercise-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { findExerciseForOrganization } from "@/modules/exercises/db/queries";

export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const context = await loadLibraryAppContext();

  if (context.libraryAccess !== "manage") {
    redirect("/app/library/exercises");
  }

  const { exerciseId } = await params;
  const exercise = await withDatabase((database) =>
    findExerciseForOrganization(database, {
      organizationId: context.membership.organizationId,
      exerciseId,
    }),
  );

  if (!exercise) notFound();
  if (exercise.status === "archived") {
    redirect("/app/library/exercises?status=archived");
  }

  return (
    <div className="py-7">
      <Card className="mx-auto max-w-3xl rounded-md">
        <CardHeader>
          <CardTitle>Edit exercise</CardTitle>
          <CardDescription>
            Changes apply anywhere this library exercise is referenced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExerciseForm action={updateExerciseAction} exercise={exercise} />
        </CardContent>
      </Card>
    </div>
  );
}
