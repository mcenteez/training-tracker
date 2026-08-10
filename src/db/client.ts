import "server-only";

import { drizzle } from "drizzle-orm/neon-serverless";

import { getDatabaseUrl } from "./env";

function createDatabase() {
  return drizzle(getDatabaseUrl());
}

export type Database = ReturnType<typeof createDatabase>;

export async function withDatabase<Result>(
  operation: (database: Database) => Promise<Result>,
): Promise<Result> {
  const database = createDatabase();

  try {
    return await operation(database);
  } finally {
    await database.$client.end();
  }
}
