import { redirect } from "next/navigation";

import { createExerciseAction } from "@/app/(app)/app/library/actions";
import { ExerciseForm } from "@/components/library/exercise-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadLibraryAppContext } from "@/lib/library-context";

export default async function NewExercisePage() {
  const context = await loadLibraryAppContext();

  if (context.libraryAccess !== "manage") {
    redirect("/app/library/exercises");
  }

  return (
    <div className="py-7">
      <Card className="mx-auto max-w-3xl rounded-md">
        <CardHeader>
          <CardTitle>Create exercise</CardTitle>
          <CardDescription>
            Add a reusable movement to the organization library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExerciseForm action={createExerciseAction} />
        </CardContent>
      </Card>
    </div>
  );
}
