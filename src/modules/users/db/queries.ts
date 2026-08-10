import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { users } from "@/modules/users/db/schema";

export async function findUserByClerkUserId(
  database: Database,
  clerkUserId: string,
): Promise<{ id: string; clerkUserId: string; email: string } | null> {
  const [user] = await database
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      email: users.email,
    })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  return user ?? null;
}
