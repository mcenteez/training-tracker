import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { findPlanWithSchedule } from "@/modules/plans/db/queries";

function formatDay(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const context = await loadLibraryAppContext();
  const { planId } = await params;
  const plan = await withDatabase((database) =>
    findPlanWithSchedule(database, {
      organizationId: context.membership.organizationId,
      planId,
    }),
  );
  if (!plan) notFound();

  return (
    <div className="space-y-6 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary uppercase">
            {plan.status}
          </p>
          <h2 className="mt-2 text-3xl font-semibold">{plan.name}</h2>
          {plan.description ? (
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {plan.description}
            </p>
          ) : null}
        </div>
        {context.libraryAccess === "manage" && plan.status !== "archived" ? (
          <Button asChild variant="outline">
            <Link href={`/app/library/plans/${plan.id}/edit`}>
              <Pencil aria-hidden="true" /> Edit plan
            </Link>
          </Button>
        ) : null}
      </div>

      {plan.scheduleSlots.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          This draft has no scheduled sessions yet.
        </div>
      ) : (
        <section className="border border-border bg-card">
          <header className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="font-semibold">Weekly schedule</h3>
          </header>
          <div className="divide-y divide-border">
            {plan.scheduleSlots.map((slot) => (
              <div
                key={slot.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"
              >
                <div className="text-sm font-medium">
                  {formatDay(slot.dayOfWeek)}
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>
                    {slot.label || slot.workoutName}
                    {slot.label ? ` · ${slot.workoutName}` : ""}
                  </p>
                  <p className="mt-1 text-xs capitalize">
                    Workout status: {slot.workoutStatus}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
