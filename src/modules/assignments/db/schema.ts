import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { exerciseCategory, exercises } from "@/modules/exercises/db/schema";
import {
  organizationMemberships,
  organizations,
} from "@/modules/organizations/db/schema";
import {
  planDayOfWeek,
  planScheduleSlots,
  plans,
} from "@/modules/plans/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import {
  workoutBlocks,
  workoutItems,
  workouts,
} from "@/modules/workouts/db/schema";

export const assignmentStatuses = ["draft", "published", "canceled"] as const;
export const assignmentTargetTypes = ["team", "athlete"] as const;
export const assignmentSessionStatuses = [
  "assigned",
  "in_progress",
  "submitted",
] as const;

export const assignmentStatus = pgEnum("assignment_status", assignmentStatuses);
export const assignmentTargetType = pgEnum(
  "assignment_target_type",
  assignmentTargetTypes,
);
export const assignmentSessionStatus = pgEnum(
  "assignment_session_status",
  assignmentSessionStatuses,
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourcePlanId: uuid("source_plan_id"),
    sourceWorkoutId: uuid("source_workout_id"),
    timezone: text().notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    scheduledDate: date("scheduled_date"),
    availableFrom: timestamp("available_from", { withTimezone: true }),
    availableUntil: timestamp("available_until", { withTimezone: true }),
    status: assignmentStatus().default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
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
    unique("assignments_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.sourcePlanId],
      foreignColumns: [plans.organizationId, plans.id],
      name: "assignments_source_plan_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.sourceWorkoutId],
      foreignColumns: [workouts.organizationId, workouts.id],
      name: "assignments_source_workout_fk",
    }),
    check(
      "assignments_exactly_one_source",
      sql`(${table.sourcePlanId} IS NOT NULL) <> (${table.sourceWorkoutId} IS NOT NULL)`,
    ),
    check(
      "assignments_plan_source_dates",
      sql`(${table.sourcePlanId} IS NULL) OR (
        ${table.startDate} IS NOT NULL
        AND ${table.endDate} IS NOT NULL
        AND ${table.scheduledDate} IS NULL
      )`,
    ),
    check(
      "assignments_workout_source_dates",
      sql`(${table.sourceWorkoutId} IS NULL) OR (
        ${table.scheduledDate} IS NOT NULL
        AND ${table.startDate} IS NULL
        AND ${table.endDate} IS NULL
      )`,
    ),
    check(
      "assignments_plan_date_order",
      sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.startDate} <= ${table.endDate}`,
    ),
    check(
      "assignments_availability_order",
      sql`${table.availableFrom} IS NULL OR ${table.availableUntil} IS NULL OR ${table.availableFrom} < ${table.availableUntil}`,
    ),
    check("assignments_version_positive", sql`${table.version} > 0`),
    index("assignments_organization_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("assignments_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const assignmentTargets = pgTable(
  "assignment_targets",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    targetType: assignmentTargetType("target_type").notNull(),
    teamId: uuid("team_id"),
    athleteUserId: uuid("athlete_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("assignment_targets_organization_assignment_id_unique").on(
      table.organizationId,
      table.assignmentId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [assignments.organizationId, assignments.id],
      name: "assignment_targets_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: "assignment_targets_team_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.athleteUserId],
      foreignColumns: [
        organizationMemberships.organizationId,
        organizationMemberships.userId,
      ],
      name: "assignment_targets_athlete_membership_fk",
    }),
    check(
      "assignment_targets_exactly_one_target",
      sql`(${table.teamId} IS NOT NULL) <> (${table.athleteUserId} IS NOT NULL)`,
    ),
    check(
      "assignment_targets_target_shape",
      sql`(
        (${table.targetType} = 'team' AND ${table.teamId} IS NOT NULL AND ${table.athleteUserId} IS NULL)
        OR
        (${table.targetType} = 'athlete' AND ${table.athleteUserId} IS NOT NULL AND ${table.teamId} IS NULL)
      )`,
    ),
    unique("assignment_targets_assignment_team_unique").on(
      table.assignmentId,
      table.teamId,
    ),
    unique("assignment_targets_assignment_athlete_unique").on(
      table.assignmentId,
      table.athleteUserId,
    ),
    index("assignment_targets_assignment_idx").on(table.assignmentId),
  ],
);

export const assignmentRecipients = pgTable(
  "assignment_recipients",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    athleteUserId: uuid("athlete_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("assignment_recipients_organization_assignment_id_unique").on(
      table.organizationId,
      table.assignmentId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [assignments.organizationId, assignments.id],
      name: "assignment_recipients_assignment_fk",
    }).onDelete("cascade"),
    unique("assignment_recipients_assignment_athlete_unique").on(
      table.assignmentId,
      table.athleteUserId,
    ),
    index("assignment_recipients_assignment_idx").on(table.assignmentId),
    index("assignment_recipients_athlete_idx").on(
      table.organizationId,
      table.athleteUserId,
    ),
  ],
);

export const assignmentWorkoutSnapshots = pgTable(
  "assignment_workout_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    sourceWorkoutId: uuid("source_workout_id"),
    sourceWorkoutVersion: integer("source_workout_version"),
    name: text().notNull(),
    description: text(),
    position: integer().notNull(),
  },
  (table) => [
    unique("assignment_workout_snapshots_organization_assignment_id_unique").on(
      table.organizationId,
      table.assignmentId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [assignments.organizationId, assignments.id],
      name: "assignment_workout_snapshots_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.sourceWorkoutId],
      foreignColumns: [workouts.organizationId, workouts.id],
      name: "assignment_workout_snapshots_source_workout_fk",
    }),
    check(
      "assignment_workout_snapshots_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    check(
      "assignment_workout_snapshots_version_positive",
      sql`${table.sourceWorkoutVersion} IS NULL OR ${table.sourceWorkoutVersion} > 0`,
    ),
    unique("assignment_workout_snapshots_assignment_position_unique").on(
      table.assignmentId,
      table.position,
    ),
    index("assignment_workout_snapshots_assignment_idx").on(table.assignmentId),
  ],
);

export const assignmentWorkoutBlockSnapshots = pgTable(
  "assignment_workout_block_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    workoutSnapshotId: uuid("workout_snapshot_id").notNull(),
    sourceBlockId: uuid("source_block_id"),
    type: text().notNull(),
    label: text(),
    rounds: integer().notNull(),
    position: integer().notNull(),
  },
  (table) => [
    unique(
      "assignment_workout_block_snapshots_organization_assignment_id_unique",
    ).on(table.organizationId, table.assignmentId, table.id),
    foreignKey({
      columns: [
        table.organizationId,
        table.assignmentId,
        table.workoutSnapshotId,
      ],
      foreignColumns: [
        assignmentWorkoutSnapshots.organizationId,
        assignmentWorkoutSnapshots.assignmentId,
        assignmentWorkoutSnapshots.id,
      ],
      name: "assignment_workout_block_snapshots_workout_snapshot_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceBlockId],
      foreignColumns: [workoutBlocks.id],
      name: "assignment_workout_block_snapshots_source_block_fk",
    }),
    check(
      "assignment_workout_block_snapshots_rounds_positive",
      sql`${table.rounds} > 0`,
    ),
    check(
      "assignment_workout_block_snapshots_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    unique("assignment_workout_block_snapshots_workout_position_unique").on(
      table.workoutSnapshotId,
      table.position,
    ),
    index("assignment_workout_block_snapshots_workout_idx").on(
      table.workoutSnapshotId,
    ),
  ],
);

export const assignmentWorkoutItemSnapshots = pgTable(
  "assignment_workout_item_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    blockSnapshotId: uuid("block_snapshot_id").notNull(),
    sourceItemId: uuid("source_item_id"),
    sourceExerciseId: uuid("source_exercise_id"),
    exerciseName: text("exercise_name").notNull(),
    exerciseInstructions: text("exercise_instructions"),
    exerciseCategory: exerciseCategory("exercise_category").default("other"),
    exerciseEquipment: text("exercise_equipment").array(),
    exerciseVideoUrl: text("exercise_video_url"),
    position: integer().notNull(),
    reps: integer(),
    load: text(),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: integer("distance_meters"),
    restSeconds: integer("rest_seconds"),
    tempo: text(),
    notes: text(),
  },
  (table) => [
    unique(
      "assignment_workout_item_snapshots_organization_assignment_id_unique",
    ).on(table.organizationId, table.assignmentId, table.id),
    foreignKey({
      columns: [
        table.organizationId,
        table.assignmentId,
        table.blockSnapshotId,
      ],
      foreignColumns: [
        assignmentWorkoutBlockSnapshots.organizationId,
        assignmentWorkoutBlockSnapshots.assignmentId,
        assignmentWorkoutBlockSnapshots.id,
      ],
      name: "assignment_workout_item_snapshots_block_snapshot_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceItemId],
      foreignColumns: [workoutItems.id],
      name: "assignment_workout_item_snapshots_source_item_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.sourceExerciseId],
      foreignColumns: [exercises.organizationId, exercises.id],
      name: "assignment_workout_item_snapshots_source_exercise_fk",
    }),
    check(
      "assignment_workout_item_snapshots_reps_nonnegative",
      sql`${table.reps} IS NULL OR ${table.reps} >= 0`,
    ),
    check(
      "assignment_workout_item_snapshots_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "assignment_workout_item_snapshots_distance_nonnegative",
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    check(
      "assignment_workout_item_snapshots_rest_nonnegative",
      sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`,
    ),
    check(
      "assignment_workout_item_snapshots_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    unique("assignment_workout_item_snapshots_block_position_unique").on(
      table.blockSnapshotId,
      table.position,
    ),
    index("assignment_workout_item_snapshots_block_idx").on(
      table.blockSnapshotId,
    ),
  ],
);

export const assignmentPlanSlotSnapshots = pgTable(
  "assignment_plan_slot_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    sourcePlanSlotId: uuid("source_plan_slot_id"),
    workoutSnapshotId: uuid("workout_snapshot_id").notNull(),
    dayOfWeek: planDayOfWeek("day_of_week").notNull(),
    position: integer().notNull(),
    label: text(),
  },
  (table) => [
    unique(
      "assignment_plan_slot_snapshots_organization_assignment_id_unique",
    ).on(table.organizationId, table.assignmentId, table.id),
    foreignKey({
      columns: [table.organizationId, table.assignmentId],
      foreignColumns: [assignments.organizationId, assignments.id],
      name: "assignment_plan_slot_snapshots_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.assignmentId,
        table.workoutSnapshotId,
      ],
      foreignColumns: [
        assignmentWorkoutSnapshots.organizationId,
        assignmentWorkoutSnapshots.assignmentId,
        assignmentWorkoutSnapshots.id,
      ],
      name: "assignment_plan_slot_snapshots_workout_snapshot_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourcePlanSlotId],
      foreignColumns: [planScheduleSlots.id],
      name: "assignment_plan_slot_snapshots_source_slot_fk",
    }),
    check(
      "assignment_plan_slot_snapshots_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
    unique("assignment_plan_slot_snapshots_assignment_day_position_unique").on(
      table.assignmentId,
      table.dayOfWeek,
      table.position,
    ),
    index("assignment_plan_slot_snapshots_assignment_idx").on(
      table.assignmentId,
    ),
  ],
);

export const assignmentSessions = pgTable(
  "assignment_sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    athleteUserId: uuid("athlete_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workoutSnapshotId: uuid("workout_snapshot_id").notNull(),
    planSlotSnapshotId: uuid("plan_slot_snapshot_id"),
    scheduledDate: date("scheduled_date").notNull(),
    availableFrom: timestamp("available_from", {
      withTimezone: true,
    }).notNull(),
    availableUntil: timestamp("available_until", {
      withTimezone: true,
    }).notNull(),
    status: assignmentSessionStatus().default("assigned").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    lastMutationId: text("last_mutation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("assignment_sessions_organization_assignment_id_unique").on(
      table.organizationId,
      table.assignmentId,
      table.id,
    ),
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.recipientId],
      foreignColumns: [
        assignmentRecipients.organizationId,
        assignmentRecipients.assignmentId,
        assignmentRecipients.id,
      ],
      name: "assignment_sessions_recipient_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.assignmentId,
        table.workoutSnapshotId,
      ],
      foreignColumns: [
        assignmentWorkoutSnapshots.organizationId,
        assignmentWorkoutSnapshots.assignmentId,
        assignmentWorkoutSnapshots.id,
      ],
      name: "assignment_sessions_workout_snapshot_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.assignmentId,
        table.planSlotSnapshotId,
      ],
      foreignColumns: [
        assignmentPlanSlotSnapshots.organizationId,
        assignmentPlanSlotSnapshots.assignmentId,
        assignmentPlanSlotSnapshots.id,
      ],
      name: "assignment_sessions_plan_slot_snapshot_fk",
    }).onDelete("cascade"),
    check(
      "assignment_sessions_availability_order",
      sql`${table.availableFrom} < ${table.availableUntil}`,
    ),
    check("assignment_sessions_version_positive", sql`${table.version} > 0`),
    unique("assignment_sessions_schedule_unique").on(
      table.assignmentId,
      table.athleteUserId,
      table.scheduledDate,
      table.workoutSnapshotId,
    ),
    index("assignment_sessions_athlete_schedule_idx").on(
      table.organizationId,
      table.athleteUserId,
      table.scheduledDate,
    ),
    index("assignment_sessions_assignment_idx").on(table.assignmentId),
  ],
);

export const assignmentSessionItemResults = pgTable(
  "assignment_session_item_results",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    itemSnapshotId: uuid("item_snapshot_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    roundNumber: integer("round_number").notNull(),
    reps: integer(),
    load: text(),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: integer("distance_meters"),
    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.sessionId],
      foreignColumns: [
        assignmentSessions.organizationId,
        assignmentSessions.assignmentId,
        assignmentSessions.id,
      ],
      name: "assignment_session_item_results_session_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.itemSnapshotId],
      foreignColumns: [
        assignmentWorkoutItemSnapshots.organizationId,
        assignmentWorkoutItemSnapshots.assignmentId,
        assignmentWorkoutItemSnapshots.id,
      ],
      name: "assignment_session_item_results_item_snapshot_fk",
    }).onDelete("cascade"),
    check(
      "assignment_session_item_results_round_positive",
      sql`${table.roundNumber} > 0`,
    ),
    check(
      "assignment_session_item_results_reps_nonnegative",
      sql`${table.reps} IS NULL OR ${table.reps} >= 0`,
    ),
    check(
      "assignment_session_item_results_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "assignment_session_item_results_distance_nonnegative",
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    unique("assignment_session_item_results_round_unique").on(
      table.sessionId,
      table.itemSnapshotId,
      table.roundNumber,
    ),
    index("assignment_session_item_results_session_idx").on(table.sessionId),
  ],
);

export const assignmentSessionComments = pgTable(
  "assignment_session_comments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.sessionId],
      foreignColumns: [
        assignmentSessions.organizationId,
        assignmentSessions.assignmentId,
        assignmentSessions.id,
      ],
      name: "assignment_session_comments_session_fk",
    }).onDelete("cascade"),
    index("assignment_session_comments_session_idx").on(table.sessionId),
  ],
);

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentTarget = typeof assignmentTargets.$inferSelect;
export type NewAssignmentTarget = typeof assignmentTargets.$inferInsert;
export type AssignmentRecipient = typeof assignmentRecipients.$inferSelect;
export type NewAssignmentRecipient = typeof assignmentRecipients.$inferInsert;
export type AssignmentWorkoutSnapshot =
  typeof assignmentWorkoutSnapshots.$inferSelect;
export type NewAssignmentWorkoutSnapshot =
  typeof assignmentWorkoutSnapshots.$inferInsert;
export type AssignmentWorkoutBlockSnapshot =
  typeof assignmentWorkoutBlockSnapshots.$inferSelect;
export type NewAssignmentWorkoutBlockSnapshot =
  typeof assignmentWorkoutBlockSnapshots.$inferInsert;
export type AssignmentWorkoutItemSnapshot =
  typeof assignmentWorkoutItemSnapshots.$inferSelect;
export type NewAssignmentWorkoutItemSnapshot =
  typeof assignmentWorkoutItemSnapshots.$inferInsert;
export type AssignmentPlanSlotSnapshot =
  typeof assignmentPlanSlotSnapshots.$inferSelect;
export type NewAssignmentPlanSlotSnapshot =
  typeof assignmentPlanSlotSnapshots.$inferInsert;
export type AssignmentSession = typeof assignmentSessions.$inferSelect;
export type NewAssignmentSession = typeof assignmentSessions.$inferInsert;
export type AssignmentSessionItemResult =
  typeof assignmentSessionItemResults.$inferSelect;
export type NewAssignmentSessionItemResult =
  typeof assignmentSessionItemResults.$inferInsert;
export type AssignmentSessionComment =
  typeof assignmentSessionComments.$inferSelect;
export type NewAssignmentSessionComment =
  typeof assignmentSessionComments.$inferInsert;
export type AssignmentStatus = (typeof assignmentStatuses)[number];
export type AssignmentTargetType = (typeof assignmentTargetTypes)[number];
export type AssignmentSessionStatus =
  (typeof assignmentSessionStatuses)[number];
