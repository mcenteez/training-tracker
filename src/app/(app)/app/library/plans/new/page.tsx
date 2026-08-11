import { redirect } from "next/navigation";

import { createPlanAction } from "@/app/(app)/app/library/actions";
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
import { listWorkoutsForOrganization } from "@/modules/workouts/db/queries";

export default async function NewPlanPage() {
  const context = await loadLibraryAppContext();
  if (context.libraryAccess !== "manage") redirect("/app/library/plans");
  const workouts = await withDatabase((database) =>
    listWorkoutsForOrganization(database, {
      organizationId: context.membership.organizationId,
    }),
  );

  return (
    <div className="space-y-5 py-7">
      <LibraryGlossary />
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Create plan</CardTitle>
          <CardDescription>
            Build a multi-session weekly schedule by placing workout templates
            on cycle days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanBuilder
            action={createPlanAction}
            workouts={workouts.map(({ id, name, status }) => ({
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
