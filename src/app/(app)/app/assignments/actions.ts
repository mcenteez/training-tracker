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
  prepareAssignmentInputSchema,
  publishAssignmentInputSchema,
  returnAssignmentToDraftInputSchema,
  updateAssignmentInputSchema,
} from "@/modules/assignments/application/assignment-input";
import {
  cancelAssignment,
  createAssignment,
  prepareAssignment,
  publishAssignment,
  returnPreparedAssignmentToDraft,
  updateAssignment,
} from "@/modules/assignments/application/assignment-service";
import { createAssignmentUnitOfWork } from "@/modules/assignments/db/unit-of-work";
import { listTeamMembershipsForUserInOrganization } from "@/modules/teams/db/queries";
import {
  clearAthletePrescriptionOverride,
  saveAthletePrescriptionOverride,
} from "@/modules/assignments/application/athlete-prescription-service";
import {
  athletePrescriptionFormData,
  athletePrescriptionOverrideFormSchema,
  clearAthletePrescriptionFormSchema,
} from "@/modules/assignments/application/athlete-prescription-input";
import type { PrescriptionOverrideField } from "@/modules/assignments/application/effective-prescription";
import { normalizeStrengthLoad } from "@/modules/assignments/application/training-load";
import { createAthletePrescriptionUnitOfWork } from "@/modules/assignments/db/athlete-prescription-unit-of-work";

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

  let assignmentId: string;

  try {
    const assignment = await withDatabase((database) =>
      createAssignment(createAssignmentUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        timezone: parsed.data.timezone,
        source: parsed.data.source,
        targets: parsed.data.targets,
      }),
    );
    assignmentId = assignment.id;
  } catch (error) {
    expectedActionError(error);
  }

  revalidatePath("/app/assignments");
  redirect(`/app/assignments/${assignmentId}?created=1`);
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

export async function prepareAssignmentAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();
  const parsed = prepareAssignmentInputSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) redirect("/app/assignments?error=invalid_assignment");

  try {
    await withDatabase((database) =>
      prepareAssignment(createAssignmentUnitOfWork(database), {
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
  redirect(`/app/assignments/${parsed.data.assignmentId}?prepared=1`);
}

export async function returnAssignmentToDraftAction(
  formData: FormData,
): Promise<void> {
  const context = await ensureAssignmentAccess();
  const parsed = returnAssignmentToDraftInputSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    version: Number(formData.get("version")),
  });

  if (!parsed.success) redirect("/app/assignments?error=invalid_assignment");

  try {
    await withDatabase((database) =>
      returnPreparedAssignmentToDraft(createAssignmentUnitOfWork(database), {
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
  redirect(`/app/assignments/${parsed.data.assignmentId}?reset=1`);
}

function preparedPrescriptionPath(assignmentId: string, status: string) {
  return `/app/assignments/${assignmentId}?prescription=${status}`;
}

export async function savePreparedPrescriptionAction(
  formData: FormData,
): Promise<void> {
  const parsed = athletePrescriptionOverrideFormSchema.safeParse(
    athletePrescriptionFormData(formData),
  );
  if (!parsed.success) throw new Error("Prescription fields are invalid.");

  const context = await ensureAssignmentAccess();
  const normalizedLoad = parsed.data.overriddenFields.includes("load")
    ? normalizeStrengthLoad(
        parsed.data.loadValue === null || parsed.data.loadUnit === null
          ? null
          : { value: parsed.data.loadValue, unit: parsed.data.loadUnit },
      )
    : null;

  try {
    await withDatabase((database) =>
      saveAthletePrescriptionOverride(
        createAthletePrescriptionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          actorUserId: context.user.id,
          ...parsed.data,
          overriddenFields: parsed.data
            .overriddenFields as PrescriptionOverrideField[],
          loadValue: normalizedLoad?.value.toString() ?? null,
          loadUnit: normalizedLoad?.unit ?? null,
          normalizedLoadKg: normalizedLoad?.normalizedKg.toString() ?? null,
        },
      ),
    );
  } catch (error) {
    if (error instanceof DomainInvariantError)
      redirect(preparedPrescriptionPath(parsed.data.assignmentId, "conflict"));
    expectedActionError(error);
  }

  revalidatePath(`/app/assignments/${parsed.data.assignmentId}`);
  redirect(preparedPrescriptionPath(parsed.data.assignmentId, "saved"));
}

export async function clearPreparedPrescriptionAction(
  formData: FormData,
): Promise<void> {
  const parsed = clearAthletePrescriptionFormSchema.parse(
    athletePrescriptionFormData(formData),
  );
  const context = await ensureAssignmentAccess();

  try {
    await withDatabase((database) =>
      clearAthletePrescriptionOverride(
        createAthletePrescriptionUnitOfWork(database),
        {
          organizationId: context.membership.organizationId,
          actorUserId: context.user.id,
          ...parsed,
        },
      ),
    );
  } catch (error) {
    if (error instanceof DomainInvariantError)
      redirect(preparedPrescriptionPath(parsed.assignmentId, "conflict"));
    expectedActionError(error);
  }

  revalidatePath(`/app/assignments/${parsed.assignmentId}`);
  redirect(preparedPrescriptionPath(parsed.assignmentId, "cleared"));
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
