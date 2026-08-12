import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import type { AuthenticatedIdentity } from "./identity";

export async function getClerkIdentity(): Promise<AuthenticatedIdentity | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await currentUser();

  if (!user) {
    return null;
  }

  const primaryEmailAddress = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
  );
  const email =
    primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    return null;
  }

  const fullName =
    user.fullName?.trim() ||
    [user.firstName, user.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim() ||
    null;

  return { externalId: userId, email, fullName };
}
