"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import { createOrganizationWithOwner } from "@/modules/organizations/application/organization-service";
import { listOrganizationMembershipsForUser } from "@/modules/organizations/db/queries";
import { createOrganizationUnitOfWork } from "@/modules/organizations/db/unit-of-work";

const createOrganizationInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120, "Organization name must be at most 120 characters"),
});

export async function createOrganizationAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = createOrganizationInputSchema.safeParse({
    name: formData.get("organizationName"),
  });

  if (!parsedInput.success) {
    redirect("/onboarding/organization?error=invalid_name");
  }

  const user = await loadAuthenticatedUser();

  await withDatabase(async (database) => {
    const memberships = await listOrganizationMembershipsForUser(
      database,
      user.id,
    );

    if (memberships.length > 0) {
      return;
    }

    await createOrganizationWithOwner(createOrganizationUnitOfWork(database), {
      name: parsedInput.data.name,
      ownerUserId: user.id,
    });
  });

  redirect("/app");
}
