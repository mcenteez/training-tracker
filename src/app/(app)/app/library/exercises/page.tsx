import { Archive, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import {
  archiveExerciseAction,
  restoreExerciseAction,
} from "@/app/(app)/app/library/actions";
import {
  exerciseCategories,
  exerciseStatuses,
  type ExerciseStatus,
} from "@/modules/exercises/db/schema";
import { listExercisesForOrganization } from "@/modules/exercises/db/queries";

type ExerciseLibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExerciseLibraryPage({
  searchParams,
}: ExerciseLibraryPageProps) {
  const context = await loadLibraryAppContext();
  const params = await searchParams;
  const search = single(params.search)?.trim() ?? "";
  const requestedCategory = single(params.category);
  const category = exerciseCategories.find(
    (value) => value === requestedCategory,
  );
  const requestedStatus = single(params.status);
  const status = exerciseStatuses.find(
    (value): value is ExerciseStatus => value === requestedStatus,
  );
  const exercises = await withDatabase((database) =>
    listExercisesForOrganization(database, {
      organizationId: context.membership.organizationId,
      filters: { search, category, status: status ?? "active" },
    }),
  );
  const canManage = context.libraryAccess === "manage";
  const feedback = single(params.created)
    ? "Exercise created."
    : single(params.updated)
      ? "Exercise updated."
      : single(params.archived)
        ? "Exercise archived."
        : single(params.restored)
          ? "Exercise restored."
          : single(params.error)
            ? "The exercise changed before your request completed. Reload and try again."
            : null;

  return (
    <div className="space-y-6 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Exercises</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Coaching-ready movements available to workout templates.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/app/library/exercises/new">
              <Plus aria-hidden="true" />
              New exercise
            </Link>
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p
          aria-live="polite"
          className="border border-primary/25 bg-primary/10 px-4 py-3 text-sm"
        >
          {feedback}
        </p>
      ) : null}

      <form
        className="grid gap-3 border-y border-border/70 py-4 md:grid-cols-[minmax(15rem,1fr)_12rem_12rem_auto]"
        aria-label="Filter exercises"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-2.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Search exercises"
            className="pl-9"
          />
        </div>
        <NativeSelect
          name="category"
          defaultValue={category ?? ""}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {exerciseCategories.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="status"
          defaultValue={status ?? "active"}
          aria-label="Status"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {exercises.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-14 text-center">
          <h3 className="font-medium">No exercises found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the filters or add the first exercise to this organization.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Exercises">
          {exercises.map((exercise) => (
            <Card key={exercise.id} className="rounded-md border-border/70">
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{exercise.name}</CardTitle>
                    <CardDescription className="mt-1 capitalize">
                      {exercise.category}
                    </CardDescription>
                  </div>
                  <span className="border border-border bg-muted/50 px-2 py-1 text-xs capitalize">
                    {exercise.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-3 min-h-10 text-sm text-muted-foreground">
                  {exercise.instructions || "No coaching instructions yet."}
                </p>
                {exercise.equipment.length ? (
                  <p className="text-xs text-muted-foreground">
                    Equipment: {exercise.equipment.join(", ")}
                  </p>
                ) : null}
                {canManage ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                    {exercise.status === "active" ? (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/app/library/exercises/${exercise.id}/edit`}
                          >
                            <Pencil aria-hidden="true" />
                            Edit
                          </Link>
                        </Button>
                        <form action={archiveExerciseAction}>
                          <input
                            type="hidden"
                            name="exerciseId"
                            value={exercise.id}
                          />
                          <input
                            type="hidden"
                            name="version"
                            value={exercise.version}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            <Archive aria-hidden="true" />
                            Archive
                          </Button>
                        </form>
                      </>
                    ) : (
                      <form action={restoreExerciseAction}>
                        <input
                          type="hidden"
                          name="exerciseId"
                          value={exercise.id}
                        />
                        <input
                          type="hidden"
                          name="version"
                          value={exercise.version}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          <RotateCcw aria-hidden="true" />
                          Restore
                        </Button>
                      </form>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
