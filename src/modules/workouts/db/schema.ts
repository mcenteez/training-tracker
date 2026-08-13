import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { exercises } from "@/modules/exercises/db/schema";
import { organizations } from "@/modules/organizations/db/schema";
import { users } from "@/modules/users/db/schema";

export const workoutStatuses = ["draft", "active", "archived"] as const;
export const workoutBlockTypes = ["straight", "circuit", "superset"] as const;
export const strengthLoadUnits = ["kg", "lb"] as const;

export const workoutStatus = pgEnum("workout_status", workoutStatuses);
export const workoutBlockType = pgEnum("workout_block_type", workoutBlockTypes);
export const strengthLoadUnit = pgEnum("strength_load_unit", strengthLoadUnits);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceWorkoutId: uuid("source_workout_id"),
    name: text().notNull(),
    description: text(),
    status: workoutStatus().default("draft").notNull(),
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
    unique("workouts_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.sourceWorkoutId],
      foreignColumns: [table.organizationId, table.id],
      name: "workouts_source_workout_fk",
    }),
    uniqueIndex("workouts_unarchived_name_unique")
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.status} <> 'archived'`),
    index("workouts_organization_status_name_idx").on(
      table.organizationId,
      table.status,
      table.name,
    ),
    check("workouts_version_positive", sql`${table.version} > 0`),
  ],
);

export const workoutBlocks = pgTable(
  "workout_blocks",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    type: workoutBlockType().default("straight").notNull(),
    label: text(),
    rounds: integer().default(1).notNull(),
    position: integer().notNull(),
  },
  (table) => [
    unique("workout_blocks_organization_workout_id_unique").on(
      table.organizationId,
      table.workoutId,
      table.id,
    ),
    unique("workout_blocks_workout_position_unique").on(
      table.workoutId,
      table.position,
    ),
    foreignKey({
      columns: [table.organizationId, table.workoutId],
      foreignColumns: [workouts.organizationId, workouts.id],
      name: "workout_blocks_workout_fk",
    }).onDelete("cascade"),
    check("workout_blocks_rounds_positive", sql`${table.rounds} > 0`),
    check("workout_blocks_position_nonnegative", sql`${table.position} >= 0`),
    index("workout_blocks_workout_idx").on(table.workoutId),
  ],
);

export const workoutItems = pgTable(
  "workout_items",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    blockId: uuid("block_id").notNull(),
    exerciseId: uuid("exercise_id").notNull(),
    position: integer().notNull(),
    reps: integer(),
    load: text(),
    loadValue: numeric("load_value"),
    loadUnit: strengthLoadUnit("load_unit"),
    normalizedLoadKg: numeric("normalized_load_kg"),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: integer("distance_meters"),
    restSeconds: integer("rest_seconds"),
    tempo: text(),
    notes: text(),
  },
  (table) => [
    unique("workout_items_block_position_unique").on(
      table.blockId,
      table.position,
    ),
    foreignKey({
      columns: [table.organizationId, table.workoutId, table.blockId],
      foreignColumns: [
        workoutBlocks.organizationId,
        workoutBlocks.workoutId,
        workoutBlocks.id,
      ],
      name: "workout_items_block_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.exerciseId],
      foreignColumns: [exercises.organizationId, exercises.id],
      name: "workout_items_exercise_fk",
    }).onDelete("cascade"),
    check(
      "workout_items_reps_nonnegative",
      sql`${table.reps} IS NULL OR ${table.reps} >= 0`,
    ),
    check(
      "workout_items_structured_load_complete",
      sql`(
        ${table.loadValue} IS NULL
        AND ${table.loadUnit} IS NULL
        AND ${table.normalizedLoadKg} IS NULL
      ) OR (
        ${table.loadValue} > 0
        AND ${table.loadUnit} IS NOT NULL
        AND ${table.normalizedLoadKg} > 0
      )`,
    ),
    check(
      "workout_items_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "workout_items_distance_nonnegative",
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    check(
      "workout_items_rest_nonnegative",
      sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`,
    ),
    check("workout_items_position_nonnegative", sql`${table.position} >= 0`),
    index("workout_items_block_idx").on(table.blockId),
    index("workout_items_exercise_idx").on(table.exerciseId),
  ],
);

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type WorkoutBlock = typeof workoutBlocks.$inferSelect;
export type NewWorkoutBlock = typeof workoutBlocks.$inferInsert;
export type WorkoutItem = typeof workoutItems.$inferSelect;
export type NewWorkoutItem = typeof workoutItems.$inferInsert;
export type WorkoutStatus = (typeof workoutStatuses)[number];
