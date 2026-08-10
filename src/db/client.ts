import "server-only";

import { drizzle } from "drizzle-orm/neon-http";

import { getDatabaseUrl } from "./env";

function createDatabase() {
  return drizzle(getDatabaseUrl());
}

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

export function getDatabase(): Database {
  database ??= createDatabase();
  return database;
}
