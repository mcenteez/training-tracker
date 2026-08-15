import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { findWorkoutWithStructure } from "@/modules/workouts/db/queries";
import {
  formatResistance,
  type Resistance,
} from "@/modules/resistance/application/resistance";

function prescription(item: {
  reps: number | null;
  load: string | null;
  resistance: Resistance | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  restSeconds: number | null;
  tempo: string | null;
}) {
  return (
    [
      item.reps !== null ? `${item.reps} reps` : null,
      item.resistance ? formatResistance(item.resistance) : item.load,
      item.durationSeconds !== null ? `${item.durationSeconds}s` : null,
      item.distanceMeters !== null ? `${item.distanceMeters}m` : null,
      item.restSeconds !== null ? `${item.restSeconds}s rest` : null,
      item.tempo ? `tempo ${item.tempo}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Coaching notes only"
  );
}

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const context = await loadLibraryAppContext();
  const { workoutId } = await params;
  const workout = await withDatabase((database) =>
    findWorkoutWithStructure(database, {
      organizationId: context.membership.organizationId,
      workoutId,
    }),
  );
  if (!workout) notFound();

  return (
    <div className="space-y-6 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase">
            {workout.status}
          </p>
          <h2 className="mt-2 text-3xl font-semibold">{workout.name}</h2>
          {workout.description ? (
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {workout.description}
            </p>
          ) : null}
        </div>
        {context.libraryAccess === "manage" && workout.status !== "archived" ? (
          <Button asChild variant="outline">
            <Link href={`/app/library/workouts/${workout.id}/edit`}>
              <Pencil aria-hidden="true" /> Edit workout
            </Link>
          </Button>
        ) : null}
      </div>
      {workout.blocks.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          This draft has no training blocks yet.
        </div>
      ) : (
        <div className="space-y-4">
          {workout.blocks.map((block, index) => (
            <section key={block.id} className="border border-border bg-card">
              <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Block {index + 1} · {block.type}
                  </p>
                  <h3 className="font-semibold">
                    {block.label || "Untitled block"}
                  </h3>
                </div>
                <span className="text-sm">{block.rounds} rounds</span>
              </header>
              <div className="divide-y divide-border">
                {block.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(12rem,1fr)_2fr]"
                  >
                    <div className="font-medium">
                      {item.exerciseName}
                      {item.exerciseStatus === "archived" ? (
                        <span className="ml-2 text-xs text-destructive">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>{prescription(item)}</p>
                      {item.notes ? <p className="mt-1">{item.notes}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
