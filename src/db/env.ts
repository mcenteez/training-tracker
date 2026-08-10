import "server-only";

import { z } from "zod";

const clerkPublishableKeySchema = z.string().min(1);
const clerkSecretKeySchema = z.string().min(1);

export function getDatabaseUrl(): string {
  const rawValue = z.string().min(1).parse(process.env.DATABASE_URL).trim();

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawValue);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }

  if (
    parsedUrl.protocol !== "postgres:" &&
    parsedUrl.protocol !== "postgresql:"
  ) {
    throw new Error(
      "DATABASE_URL must use the postgres:// or postgresql:// protocol",
    );
  }

  return rawValue;
}

export function getClerkPublishableKey(): string {
  return clerkPublishableKeySchema.parse(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

export function getClerkSecretKey(): string {
  return clerkSecretKeySchema.parse(process.env.CLERK_SECRET_KEY);
}
