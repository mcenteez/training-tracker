import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "@/modules/organizations/db/schema";
import { users } from "@/modules/users/db/schema";

export const exerciseCategories = [
  "strength",
  "power",
  "conditioning",
  "mobility",
  "warmup",
  "recovery",
  "other",
] as const;
export const exerciseStatuses = ["active", "archived"] as const;

export const exerciseCategory = pgEnum("exercise_category", exerciseCategories);
export const exerciseStatus = pgEnum("exercise_status", exerciseStatuses);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    instructions: text(),
    category: exerciseCategory().default("other").notNull(),
    equipment: text()
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    videoUrl: text("video_url"),
    status: exerciseStatus().default("active").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("exercises_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("exercises_active_name_unique")
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.status} = 'active'`),
    index("exercises_organization_status_name_idx").on(
      table.organizationId,
      table.status,
      table.name,
    ),
  ],
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type ExerciseStatus = (typeof exerciseStatuses)[number];
