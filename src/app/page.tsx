import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { withDatabase } from "@/db/client";
import { getAuthenticatedUserContext } from "@/modules/users/application/user-service";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const clerkUser = await currentUser();

  const primaryEmailAddress = clerkUser?.emailAddresses.find(
    (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId,
  );

  const email =
    primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  const fullName =
    clerkUser?.fullName?.trim() ||
    [clerkUser?.firstName, clerkUser?.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim() ||
    null;

  if (!email) {
    throw new Error("Authenticated user is missing an email address");
  }

  const userContext = await withDatabase((database) =>
    getAuthenticatedUserContext(database, {
      clerkUserId: userId,
      email,
      fullName,
    }),
  );

  if (!userContext.hasOrganizationMembership) {
    redirect("/onboarding/organization");
  }

  redirect("/app");
}
