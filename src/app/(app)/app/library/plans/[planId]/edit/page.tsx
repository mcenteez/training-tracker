import { notFound, redirect } from "next/navigation";

import { updatePlanAction } from "@/app/(app)/app/library/actions";
import { LibraryGlossary } from "@/components/library/library-glossary";
import { PlanBuilder } from "@/components/library/plan-builder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { findPlanWithSchedule } from "@/modules/plans/db/queries";
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const context = await loadLibraryAppContext();
  if (context.libraryAccess !== "manage") redirect("/app/library/plans");

  const { planId } = await params;
  const [plan, workouts] = await withDatabase(async (database) =>
    Promise.all([
      findPlanWithSchedule(database, {
        organizationId: context.membership.organizationId,
        planId,
      }),
      listWorkoutsForOrganization(database, {
        organizationId: context.membership.organizationId,
      }),
    ]),
  );

  if (!plan) notFound();
  if (plan.status === "archived")
    redirect("/app/library/plans?status=archived");

  return (
    <div className="space-y-5 py-7">
      <LibraryGlossary />
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Edit plan</CardTitle>
          <CardDescription>
            Update this multi-session schedule while keeping workout template
            content managed in the workouts library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanBuilder
            action={updatePlanAction}
            workouts={workouts.map(({ id, name, status }) => ({
              id,
              name,
              status,
            }))}
            plan={{
              id: plan.id,
              name: plan.name,
              description: plan.description,
              version: plan.version,
              scheduleSlots: plan.scheduleSlots.map((slot) => ({
                workoutId: slot.workoutId,
                dayOfWeek: slot.dayOfWeek,
                label: slot.label,
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
