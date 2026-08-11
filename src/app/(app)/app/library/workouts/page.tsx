import { Archive, Copy, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import Link from "next/link";

import {
  archiveWorkoutAction,
  duplicateWorkoutAction,
  restoreWorkoutAction,
} from "@/app/(app)/app/library/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import {
  workoutStatuses,
  type WorkoutStatus,
} from "@/modules/workouts/db/schema";
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkoutLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await loadLibraryAppContext();
  const params = await searchParams;
  const search = single(params.search)?.trim() ?? "";
  const requestedStatus = single(params.status);
  const status = workoutStatuses.find(
    (value): value is WorkoutStatus => value === requestedStatus,
  );
  const workouts = await withDatabase((database) =>
    listWorkoutsForOrganization(database, {
      organizationId: context.membership.organizationId,
      search,
      status: status ?? "active",
    }),
  );
  const canManage = context.libraryAccess === "manage";

  return (
    <div className="space-y-6 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Workouts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Structured templates built from reusable exercises.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/app/library/workouts/new">
              <Plus aria-hidden="true" /> New workout
            </Link>
          </Button>
        ) : null}
      </div>

      {single(params.error) ? (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          The workout changed before your request completed. Reload and try
          again.
        </p>
      ) : null}

      <form
        className="grid gap-3 border-y border-border/70 py-4 md:grid-cols-[1fr_12rem_auto]"
        aria-label="Filter workouts"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-2.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Search workouts"
            className="pl-9"
          />
        </div>
        <NativeSelect
          name="status"
          defaultValue={status ?? "active"}
          aria-label="Status"
        >
          {workoutStatuses.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {workouts.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-14 text-center">
          <h3 className="font-medium">No workouts found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the filters or create the first reusable workout.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Workouts">
          {workouts.map((workout) => (
            <Card key={workout.id} className="rounded-md border-border/70">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">
                    <Link
                      href={`/app/library/workouts/${workout.id}`}
                      className="hover:text-primary"
                    >
                      {workout.name}
                    </Link>
                  </CardTitle>
                  <span className="border border-border bg-muted/50 px-2 py-1 text-xs capitalize">
                    {workout.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {workout.description || "No template description."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workout.blockCount} blocks · {workout.itemCount} exercises
                </p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                    {workout.status !== "archived" ? (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/app/library/workouts/${workout.id}/edit`}
                          >
                            <Pencil aria-hidden="true" /> Edit
                          </Link>
                        </Button>
                        <form action={duplicateWorkoutAction}>
                          <input
                            type="hidden"
                            name="workoutId"
                            value={workout.id}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            <Copy aria-hidden="true" /> Duplicate
                          </Button>
                        </form>
                        <form action={archiveWorkoutAction}>
                          <input
                            type="hidden"
                            name="workoutId"
                            value={workout.id}
                          />
                          <input
                            type="hidden"
                            name="version"
                            value={workout.version}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            <Archive aria-hidden="true" /> Archive
                          </Button>
                        </form>
                      </>
                    ) : (
                      <form action={restoreWorkoutAction}>
                        <input
                          type="hidden"
                          name="workoutId"
                          value={workout.id}
                        />
                        <input
                          type="hidden"
                          name="version"
                          value={workout.version}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          <RotateCcw aria-hidden="true" /> Restore
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
