"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withDatabase } from "@/db/client";
import { loadAuthenticatedUser } from "@/lib/app-context";
import { activeOrganizationCookieName } from "@/modules/organizations/application/active-organization";
import { findOrganizationMembershipForUser } from "@/modules/organizations/db/queries";

const selectOrganizationSchema = z.object({
  organizationId: z.uuid(),
});

export async function selectOrganizationAction(
  formData: FormData,
): Promise<void> {
  const parsedInput = selectOrganizationSchema.safeParse({
    organizationId: formData.get("organizationId"),
  });

  if (!parsedInput.success) {
    redirect("/app/organizations?error=invalid_organization");
  }

  const user = await loadAuthenticatedUser();
  const membership = await withDatabase((database) =>
    findOrganizationMembershipForUser(database, {
      userId: user.id,
      organizationId: parsedInput.data.organizationId,
    }),
  );

  if (!membership) {
    redirect("/app/organizations?error=forbidden_organization");
  }

  const cookieStore = await cookies();
  cookieStore.set(activeOrganizationCookieName, membership.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/app");
}
