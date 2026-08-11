import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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
import { workouts } from "@/modules/workouts/db/schema";

export const planStatuses = ["draft", "active", "archived"] as const;
export const planDaysOfWeek = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const planStatus = pgEnum("plan_status", planStatuses);
export const planDayOfWeek = pgEnum("plan_day_of_week", planDaysOfWeek);

export const plans = pgTable(
  "plans",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    status: planStatus().default("draft").notNull(),
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
    unique("plans_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("plans_unarchived_name_unique")
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.status} <> 'archived'`),
    index("plans_organization_status_name_idx").on(
      table.organizationId,
      table.status,
      table.name,
    ),
    check("plans_version_positive", sql`${table.version} > 0`),
  ],
);

export const planScheduleSlots = pgTable(
  "plan_schedule_slots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    planId: uuid("plan_id").notNull(),
    workoutId: uuid("workout_id").notNull(),
    dayOfWeek: planDayOfWeek("day_of_week").notNull(),
    position: integer().notNull(),
    label: text(),
  },
  (table) => [
    unique("plan_schedule_slots_organization_plan_id_unique").on(
      table.organizationId,
      table.planId,
      table.id,
    ),
    unique("plan_schedule_slots_plan_position_unique").on(
      table.planId,
      table.position,
    ),
    unique("plan_schedule_slots_plan_day_position_unique").on(
      table.planId,
      table.dayOfWeek,
      table.position,
    ),
    foreignKey({
      columns: [table.organizationId, table.planId],
      foreignColumns: [plans.organizationId, plans.id],
      name: "plan_schedule_slots_plan_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.workoutId],
      foreignColumns: [workouts.organizationId, workouts.id],
      name: "plan_schedule_slots_workout_fk",
    }),
    check(
      "plan_schedule_slots_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    index("plan_schedule_slots_plan_idx").on(table.planId),
    index("plan_schedule_slots_workout_idx").on(table.workoutId),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanScheduleSlot = typeof planScheduleSlots.$inferSelect;
export type NewPlanScheduleSlot = typeof planScheduleSlots.$inferInsert;
export type PlanStatus = (typeof planStatuses)[number];
export type PlanDayOfWeek = (typeof planDaysOfWeek)[number];
