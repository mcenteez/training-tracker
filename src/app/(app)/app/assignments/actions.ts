"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { loadActiveAppContext } from "@/lib/app-context";
import { hasPermission } from "@/modules/access-control/permissions";
import {
  AuthorizationError,
  DomainInvariantError,
  ResourceNotFoundError,
} from "@/modules/access-control/errors";
import {
  cancelAssignmentInputSchema,
  createAssignmentInputSchema,
  publishAssignmentInputSchema,
  updateAssignmentInputSchema,
} from "@/modules/assignments/application/assignment-input";
import {
  cancelAssignment,
  createAssignment,
  publishAssignment,
  updateAssignment,
} from "@/modules/assignments/application/assignment-service";
import { createAssignmentUnitOfWork } from "@/modules/assignments/db/unit-of-work";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";

async function ensureAssignmentAccess() {
  const context = await loadActiveAppContext();
  const teamMemberships = await withDatabase((database) =>
    listTeamMembershipsForUserInOrganization(database, {
      organizationId: context.membership.organizationId,
      userId: context.user.id,
    }),
  );

  const canAssignOrganization = hasPermission(
    { organizationRole: context.membership.organizationRole },
    "workout.assign.organization",
  );
  const canAssignTeam =
    teamMemberships.some((membership) => membership.teamRole === "manager") &&
    hasPermission(
      {
        organizationRole: context.membership.organizationRole,
        teamRole: "manager",
      },
      "workout.assign.team",
    );

  if (!canAssignOrganization && !canAssignTeam) {
    throw new AuthorizationError();
  }

  return context;
}

function parseTargets(formData: FormData) {
  const teamTargets = formData
    .getAll("teamIds")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((teamId) => ({ targetType: "team" as const, teamId }));

  const athleteTargets = formData
    .getAll("athleteUserIds")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((athleteUserId) => ({
      targetType: "athlete" as const,
      athleteUserId,
    }));

  return [...teamTargets, ...athleteTargets];
}

function parseSource(formData: FormData) {
  const sourceType = String(formData.get("sourceType") ?? "");

  if (sourceType === "plan") {
    return {
      sourceType: "plan" as const,
      sourcePlanId: String(formData.get("sourcePlanId") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
    };
  }

  return {
    sourceType: "workout" as const,
    sourceWorkoutId: String(formData.get("sourceWorkoutId") ?? ""),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    availableFrom: null,
    availableUntil: null,
  };
}

function expectedActionError(error: unknown): never {
  if (
    error instanceof AuthorizationError ||
    error instanceof DomainInvariantError ||
    error instanceof ResourceNotFoundError
  ) {
    redirect("/app/assignments?error=assignment_action_failed");
  }

  throw error;
}

export async function createAssignmentAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();

  const parsed = createAssignmentInputSchema.safeParse({
    timezone: context.membership.organizationTimezone,
    source: parseSource(formData),
    targets: parseTargets(formData),
  });

  if (!parsed.success) {
    redirect("/app/assignments/new?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      createAssignment(createAssignmentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        timezone: parsed.data.timezone,
        source: parsed.data.source,
        targets: parsed.data.targets,
      }),
    );
  } catch (error) {
    expectedActionError(error);
  }

  revalidatePath("/app/assignments");
  redirect("/app/assignments?created=1");
}

export async function updateAssignmentAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();

  const parsed = updateAssignmentInputSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    version: Number(formData.get("version")),
    timezone: context.membership.organizationTimezone,
    source: parseSource(formData),
    targets: parseTargets(formData),
  });

  if (!parsed.success) {
    redirect("/app/assignments?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      updateAssignment(createAssignmentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        assignmentId: parsed.data.assignmentId,
        expectedVersion: parsed.data.version,
        timezone: parsed.data.timezone,
        source: parsed.data.source,
        targets: parsed.data.targets,
      }),
    );
  } catch (error) {
    expectedActionError(error);
  }

  revalidatePath("/app/assignments");
  redirect(`/app/assignments/${parsed.data.assignmentId}?updated=1`);
}

export async function publishAssignmentAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();

  const parsed = publishAssignmentInputSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) {
    redirect("/app/assignments?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      publishAssignment(createAssignmentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        assignmentId: parsed.data.assignmentId,
        expectedVersion: parsed.data.version,
      }),
    );
  } catch (error) {
    expectedActionError(error);
  }

  revalidatePath("/app/assignments");
  redirect(`/app/assignments/${parsed.data.assignmentId}?published=1`);
}

export async function cancelAssignmentAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();

  const parsed = cancelAssignmentInputSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) {
    redirect("/app/assignments?error=invalid_assignment");
  }

  try {
    await withDatabase((database) =>
      cancelAssignment(createAssignmentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        assignmentId: parsed.data.assignmentId,
        expectedVersion: parsed.data.version,
      }),
    );
  } catch (error) {
    expectedActionError(error);
  }

  revalidatePath("/app/assignments");
  redirect(`/app/assignments/${parsed.data.assignmentId}?canceled=1`);
}
