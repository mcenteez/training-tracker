import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  planScheduleType,
  plans,
} from "@/modules/plans/db/schema";
import { teams } from "@/modules/teams/db/schema";
import { users } from "@/modules/users/db/schema";
import {
  workoutBlocks,
  workoutItems,
  workouts,
  strengthLoadUnit,
} from "@/modules/workouts/db/schema";

export const assignmentStatuses = [
  "draft",
  "prepared",
  "published",
  "canceled",
] as const;
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
    timelinessPolicyVersion: integer("timeliness_policy_version")
      .default(1)
      .notNull(),
    timelinessPolicyEffectiveAt: timestamp("timeliness_policy_effective_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    fixedDueLocalMinute: integer("fixed_due_local_minute")
      .default(1440)
      .notNull(),
    weeklyDueDay: integer("weekly_due_day").default(7).notNull(),
    weeklyDueLocalMinute: integer("weekly_due_local_minute")
      .default(1440)
      .notNull(),
    lateEntryDays: integer("late_entry_days").default(7).notNull(),
    status: assignmentStatus().default("draft").notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    preparedByUserId: uuid("prepared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    preparationResetAt: timestamp("preparation_reset_at", {
      withTimezone: true,
    }),
    preparationResetByUserId: uuid("preparation_reset_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
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
    check(
      "assignments_timeliness_policy_version_supported",
      sql`${table.timelinessPolicyVersion} = 1`,
    ),
    check(
      "assignments_fixed_due_minute_bounds",
      sql`${table.fixedDueLocalMinute} >= 0 AND ${table.fixedDueLocalMinute} <= 1440`,
    ),
    check(
      "assignments_weekly_due_day_bounds",
      sql`${table.weeklyDueDay} >= 1 AND ${table.weeklyDueDay} <= 7`,
    ),
    check(
      "assignments_weekly_due_minute_bounds",
      sql`${table.weeklyDueLocalMinute} >= 0 AND ${table.weeklyDueLocalMinute} <= 1440`,
    ),
    check(
      "assignments_late_entry_days_nonnegative",
      sql`${table.lateEntryDays} >= 0`,
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

export const assignmentRecipientTeamScopes = pgTable(
  "assignment_recipient_team_scopes",
  {
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    teamId: uuid("team_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recipientId, table.teamId] }),
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.recipientId],
      foreignColumns: [
        assignmentRecipients.organizationId,
        assignmentRecipients.assignmentId,
        assignmentRecipients.id,
      ],
      name: "assignment_recipient_team_scopes_recipient_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: "assignment_recipient_team_scopes_team_fk",
    }),
    index("assignment_recipient_team_scopes_team_assignment_idx").on(
      table.organizationId,
      table.teamId,
      table.assignmentId,
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
    }).onDelete("set null"),
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
    }).onDelete("set null"),
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
      "assignment_workout_item_snapshots_structured_load_complete",
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
    scheduleType: planScheduleType("schedule_type")
      .default("fixed_day")
      .notNull(),
    dayOfWeek: planDayOfWeek("day_of_week"),
    targetSessionsPerWeek: integer("target_sessions_per_week"),
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
    check(
      "assignment_plan_slot_snapshots_schedule_shape",
      sql`(
        (${table.scheduleType} = 'fixed_day' AND ${table.dayOfWeek} IS NOT NULL AND ${table.targetSessionsPerWeek} IS NULL)
        OR
        (${table.scheduleType} = 'weekly_frequency' AND ${table.dayOfWeek} IS NULL AND ${table.targetSessionsPerWeek} IS NOT NULL)
      )`,
    ),
    check(
      "assignment_plan_slot_snapshots_weekly_target_bounds",
      sql`${table.targetSessionsPerWeek} IS NULL OR (${table.targetSessionsPerWeek} > 0 AND ${table.targetSessionsPerWeek} <= 14)`,
    ),
    unique("assignment_plan_slot_snapshots_assignment_position_unique").on(
      table.assignmentId,
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
    dueAt: timestamp("due_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    sessionRpe: integer("session_rpe"),
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
    check(
      "assignment_sessions_duration_nonnegative",
      sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} >= 0`,
    ),
    check(
      "assignment_sessions_rpe_bounds",
      sql`${table.sessionRpe} IS NULL OR (${table.sessionRpe} >= 1 AND ${table.sessionRpe} <= 10)`,
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
    index("assignment_sessions_athlete_submitted_idx").on(
      table.organizationId,
      table.athleteUserId,
      table.submittedAt,
    ),
    index("assignment_sessions_organization_submitted_idx").on(
      table.organizationId,
      table.submittedAt,
    ),
    index("assignment_sessions_organization_due_at_idx").on(
      table.organizationId,
      table.dueAt,
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
    loadValue: numeric("load_value"),
    loadUnit: strengthLoadUnit("load_unit"),
    normalizedLoadKg: numeric("normalized_load_kg"),
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
      "assignment_session_item_results_structured_load_complete",
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

export const assignmentAthleteItemOverrides = pgTable(
  "assignment_athlete_item_overrides",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    athleteUserId: uuid("athlete_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemSnapshotId: uuid("item_snapshot_id").notNull(),
    planSlotSnapshotId: uuid("plan_slot_snapshot_id"),
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
    overriddenFields: text("overridden_fields").array().default([]).notNull(),
    reason: text(),
    version: integer().default(1).notNull(),
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
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.recipientId],
      foreignColumns: [
        assignmentRecipients.organizationId,
        assignmentRecipients.assignmentId,
        assignmentRecipients.id,
      ],
      name: "assignment_athlete_item_overrides_recipient_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.itemSnapshotId],
      foreignColumns: [
        assignmentWorkoutItemSnapshots.organizationId,
        assignmentWorkoutItemSnapshots.assignmentId,
        assignmentWorkoutItemSnapshots.id,
      ],
      name: "assignment_athlete_item_overrides_item_snapshot_fk",
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
      name: "assignment_athlete_item_overrides_plan_slot_snapshot_fk",
    }).onDelete("cascade"),
    check(
      "assignment_athlete_item_overrides_reps_nonnegative",
      sql`${table.reps} IS NULL OR ${table.reps} >= 0`,
    ),
    check(
      "assignment_athlete_item_overrides_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "assignment_athlete_item_overrides_distance_nonnegative",
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    check(
      "assignment_athlete_item_overrides_rest_nonnegative",
      sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`,
    ),
    check(
      "assignment_athlete_item_overrides_structured_load_complete",
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
      "assignment_athlete_item_overrides_version_positive",
      sql`${table.version} > 0`,
    ),
    check(
      "assignment_athlete_item_overrides_fields_supported",
      sql`${table.overriddenFields} <@ ARRAY['reps', 'load', 'durationSeconds', 'distanceMeters', 'restSeconds', 'tempo', 'notes']::text[]`,
    ),
    uniqueIndex(
      "assignment_athlete_item_overrides_recipient_item_slot_unique",
    ).on(
      table.recipientId,
      table.itemSnapshotId,
      sql`coalesce(${table.planSlotSnapshotId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("assignment_athlete_item_overrides_recipient_idx").on(
      table.organizationId,
      table.recipientId,
    ),
  ],
);

export const assignmentSessionEffectiveItemPrescriptions = pgTable(
  "assignment_session_effective_item_prescriptions",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    itemSnapshotId: uuid("item_snapshot_id").notNull(),
    sourceOverrideId: uuid("source_override_id"),
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
      name: "assignment_session_effective_item_prescriptions_session_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.assignmentId, table.itemSnapshotId],
      foreignColumns: [
        assignmentWorkoutItemSnapshots.organizationId,
        assignmentWorkoutItemSnapshots.assignmentId,
        assignmentWorkoutItemSnapshots.id,
      ],
      name: "assignment_session_effective_item_prescriptions_item_snapshot_fk",
    }),
    foreignKey({
      columns: [table.sourceOverrideId],
      foreignColumns: [assignmentAthleteItemOverrides.id],
      name: "assignment_session_effective_item_prescriptions_override_fk",
    }).onDelete("set null"),
    check(
      "assignment_session_effective_item_prescriptions_reps_nonnegative",
      sql`${table.reps} IS NULL OR ${table.reps} >= 0`,
    ),
    check(
      "assignment_session_effective_item_prescriptions_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "assignment_session_effective_item_prescriptions_distance_nonnegative",
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    check(
      "assignment_session_effective_item_prescriptions_rest_nonnegative",
      sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`,
    ),
    check(
      "assignment_session_effective_item_prescriptions_structured_load_complete",
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
    unique(
      "assignment_session_effective_item_prescriptions_session_item_unique",
    ).on(table.sessionId, table.itemSnapshotId),
    index("assignment_session_effective_item_prescriptions_session_idx").on(
      table.sessionId,
    ),
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
export type AssignmentRecipientTeamScope =
  typeof assignmentRecipientTeamScopes.$inferSelect;
export type NewAssignmentRecipientTeamScope =
  typeof assignmentRecipientTeamScopes.$inferInsert;
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
export type AssignmentAthleteItemOverride =
  typeof assignmentAthleteItemOverrides.$inferSelect;
export type NewAssignmentAthleteItemOverride =
  typeof assignmentAthleteItemOverrides.$inferInsert;
export type AssignmentSessionEffectiveItemPrescription =
  typeof assignmentSessionEffectiveItemPrescriptions.$inferSelect;
export type NewAssignmentSessionEffectiveItemPrescription =
  typeof assignmentSessionEffectiveItemPrescriptions.$inferInsert;
export type AssignmentSessionComment =
  typeof assignmentSessionComments.$inferSelect;
export type NewAssignmentSessionComment =
  typeof assignmentSessionComments.$inferInsert;
export type AssignmentStatus = (typeof assignmentStatuses)[number];
export type AssignmentTargetType = (typeof assignmentTargetTypes)[number];
export type AssignmentSessionStatus =
  (typeof assignmentSessionStatuses)[number];
