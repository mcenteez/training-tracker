"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { createOrganizationWithOwner } from "@/modules/organizations/application/organization-service";
import { createOrganizationUnitOfWork } from "@/modules/organizations/db/unit-of-work";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";

const createOrganizationInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120, "Organization name must be at most 120 characters"),
});

function getPrimaryEmailAddress(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | null {
  if (!user) {
    return null;
  }

  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );

  return (
    primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

export async function createOrganizationAction(
  formData: FormData,
): Promise<void> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const parsedInput = createOrganizationInputSchema.safeParse({
    name: formData.get("organizationName"),
  });

  if (!parsedInput.success) {
    redirect("/onboarding/organization?error=invalid_name");
  }

  const user = await currentUser();
  const email = getPrimaryEmailAddress(user);

  if (!email) {
    redirect("/onboarding/organization?error=missing_email");
  }

  await withDatabase(async (database) => {
    const userContext = await getAuthenticatedUserContext(database, {
      clerkUserId: userId,
      email,
    });

    if (userContext.hasOrganizationMembership) {
      return;
    }

    await createOrganizationWithOwner(createOrganizationUnitOfWork(database), {
      name: parsedInput.data.name,
      ownerUserId: userContext.id,
    });
  });

  redirect("/app");
}
