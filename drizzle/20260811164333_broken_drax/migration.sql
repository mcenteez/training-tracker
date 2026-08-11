CREATE TYPE "assignment_session_status" AS ENUM('assigned', 'in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "assignment_status" AS ENUM('draft', 'published', 'canceled');--> statement-breakpoint
CREATE TYPE "assignment_target_type" AS ENUM('team', 'athlete');--> statement-breakpoint
CREATE TABLE "assignment_plan_slot_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"source_plan_slot_id" uuid,
	"workout_snapshot_id" uuid NOT NULL,
	"day_of_week" "plan_day_of_week" NOT NULL,
	"position" integer NOT NULL,
	"label" text,
	CONSTRAINT "assignment_plan_slot_snapshots_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_plan_slot_snapshots_assignment_day_position_unique" UNIQUE("assignment_id","day_of_week","position"),
	CONSTRAINT "assignment_plan_slot_snapshots_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"athlete_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_recipients_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_recipients_assignment_athlete_unique" UNIQUE("assignment_id","athlete_user_id")
);
--> statement-breakpoint
CREATE TABLE "assignment_session_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_session_item_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"item_snapshot_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"reps" integer,
	"load" text,
	"duration_seconds" integer,
	"distance_meters" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_session_item_results_round_unique" UNIQUE("session_id","item_snapshot_id","round_number"),
	CONSTRAINT "assignment_session_item_results_round_positive" CHECK ("round_number" > 0),
	CONSTRAINT "assignment_session_item_results_reps_nonnegative" CHECK ("reps" IS NULL OR "reps" >= 0),
	CONSTRAINT "assignment_session_item_results_duration_nonnegative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
	CONSTRAINT "assignment_session_item_results_distance_nonnegative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"athlete_user_id" uuid NOT NULL,
	"workout_snapshot_id" uuid NOT NULL,
	"plan_slot_snapshot_id" uuid,
	"scheduled_date" date NOT NULL,
	"available_from" timestamp with time zone NOT NULL,
	"available_until" timestamp with time zone NOT NULL,
	"status" "assignment_session_status" DEFAULT 'assigned'::"assignment_session_status" NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"last_mutation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_sessions_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_sessions_schedule_unique" UNIQUE("assignment_id","athlete_user_id","scheduled_date","workout_snapshot_id"),
	CONSTRAINT "assignment_sessions_availability_order" CHECK ("available_from" < "available_until"),
	CONSTRAINT "assignment_sessions_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"target_type" "assignment_target_type" NOT NULL,
	"team_id" uuid,
	"athlete_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_targets_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_targets_assignment_team_unique" UNIQUE("assignment_id","team_id"),
	CONSTRAINT "assignment_targets_assignment_athlete_unique" UNIQUE("assignment_id","athlete_user_id"),
	CONSTRAINT "assignment_targets_exactly_one_target" CHECK (("team_id" IS NOT NULL) <> ("athlete_user_id" IS NOT NULL)),
	CONSTRAINT "assignment_targets_target_shape" CHECK ((
        ("target_type" = 'team' AND "team_id" IS NOT NULL AND "athlete_user_id" IS NULL)
        OR
        ("target_type" = 'athlete' AND "athlete_user_id" IS NOT NULL AND "team_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "assignment_workout_block_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"workout_snapshot_id" uuid NOT NULL,
	"source_block_id" uuid,
	"type" text NOT NULL,
	"label" text,
	"rounds" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "assignment_workout_block_snapshots_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_workout_block_snapshots_workout_position_unique" UNIQUE("workout_snapshot_id","position"),
	CONSTRAINT "assignment_workout_block_snapshots_rounds_positive" CHECK ("rounds" > 0),
	CONSTRAINT "assignment_workout_block_snapshots_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_workout_item_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"block_snapshot_id" uuid NOT NULL,
	"source_item_id" uuid,
	"source_exercise_id" uuid,
	"exercise_name" text NOT NULL,
	"exercise_instructions" text,
	"exercise_category" "exercise_category" DEFAULT 'other'::"exercise_category",
	"exercise_equipment" text[],
	"exercise_video_url" text,
	"position" integer NOT NULL,
	"reps" integer,
	"load" text,
	"duration_seconds" integer,
	"distance_meters" integer,
	"rest_seconds" integer,
	"tempo" text,
	"notes" text,
	CONSTRAINT "assignment_workout_item_snapshots_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_workout_item_snapshots_block_position_unique" UNIQUE("block_snapshot_id","position"),
	CONSTRAINT "assignment_workout_item_snapshots_reps_nonnegative" CHECK ("reps" IS NULL OR "reps" >= 0),
	CONSTRAINT "assignment_workout_item_snapshots_duration_nonnegative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
	CONSTRAINT "assignment_workout_item_snapshots_distance_nonnegative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0),
	CONSTRAINT "assignment_workout_item_snapshots_rest_nonnegative" CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0),
	CONSTRAINT "assignment_workout_item_snapshots_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_workout_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"source_workout_id" uuid,
	"source_workout_version" integer,
	"name" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	CONSTRAINT "assignment_workout_snapshots_organization_assignment_id_unique" UNIQUE("organization_id","assignment_id","id"),
	CONSTRAINT "assignment_workout_snapshots_assignment_position_unique" UNIQUE("assignment_id","position"),
	CONSTRAINT "assignment_workout_snapshots_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "assignment_workout_snapshots_version_positive" CHECK ("source_workout_version" IS NULL OR "source_workout_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"source_plan_id" uuid,
	"source_workout_id" uuid,
	"timezone" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"scheduled_date" date,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"status" "assignment_status" DEFAULT 'draft'::"assignment_status" NOT NULL,
	"published_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "assignments_exactly_one_source" CHECK (("source_plan_id" IS NOT NULL) <> ("source_workout_id" IS NOT NULL)),
	CONSTRAINT "assignments_plan_source_dates" CHECK (("source_plan_id" IS NULL) OR (
        "start_date" IS NOT NULL
        AND "end_date" IS NOT NULL
        AND "scheduled_date" IS NULL
      )),
	CONSTRAINT "assignments_workout_source_dates" CHECK (("source_workout_id" IS NULL) OR (
        "scheduled_date" IS NOT NULL
        AND "start_date" IS NULL
        AND "end_date" IS NULL
      )),
	CONSTRAINT "assignments_plan_date_order" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date"),
	CONSTRAINT "assignments_availability_order" CHECK ("available_from" IS NULL OR "available_until" IS NULL OR "available_from" < "available_until"),
	CONSTRAINT "assignments_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "assignment_plan_slot_snapshots_assignment_idx" ON "assignment_plan_slot_snapshots" ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_recipients_assignment_idx" ON "assignment_recipients" ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_recipients_athlete_idx" ON "assignment_recipients" ("organization_id","athlete_user_id");--> statement-breakpoint
CREATE INDEX "assignment_session_comments_session_idx" ON "assignment_session_comments" ("session_id");--> statement-breakpoint
CREATE INDEX "assignment_session_item_results_session_idx" ON "assignment_session_item_results" ("session_id");--> statement-breakpoint
CREATE INDEX "assignment_sessions_athlete_schedule_idx" ON "assignment_sessions" ("organization_id","athlete_user_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "assignment_sessions_assignment_idx" ON "assignment_sessions" ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_targets_assignment_idx" ON "assignment_targets" ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_workout_block_snapshots_workout_idx" ON "assignment_workout_block_snapshots" ("workout_snapshot_id");--> statement-breakpoint
CREATE INDEX "assignment_workout_item_snapshots_block_idx" ON "assignment_workout_item_snapshots" ("block_snapshot_id");--> statement-breakpoint
CREATE INDEX "assignment_workout_snapshots_assignment_idx" ON "assignment_workout_snapshots" ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignments_organization_status_idx" ON "assignments" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "assignments_organization_created_at_idx" ON "assignments" ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots" ADD CONSTRAINT "assignment_plan_slot_snapshots_assignment_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "assignments"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots" ADD CONSTRAINT "assignment_plan_slot_snapshots_workout_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","workout_snapshot_id") REFERENCES "assignment_workout_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots" ADD CONSTRAINT "assignment_plan_slot_snapshots_source_slot_fk" FOREIGN KEY ("source_plan_slot_id") REFERENCES "plan_schedule_slots"("id");--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_athlete_user_id_users_id_fkey" FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignment_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "assignments"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_session_comments" ADD CONSTRAINT "assignment_session_comments_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignment_session_comments" ADD CONSTRAINT "assignment_session_comments_session_fk" FOREIGN KEY ("organization_id","assignment_id","session_id") REFERENCES "assignment_sessions"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD CONSTRAINT "assignment_session_item_results_session_fk" FOREIGN KEY ("organization_id","assignment_id","session_id") REFERENCES "assignment_sessions"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD CONSTRAINT "assignment_session_item_results_item_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","item_snapshot_id") REFERENCES "assignment_workout_item_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_athlete_user_id_users_id_fkey" FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_recipient_fk" FOREIGN KEY ("organization_id","assignment_id","recipient_id") REFERENCES "assignment_recipients"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_workout_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","workout_snapshot_id") REFERENCES "assignment_workout_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_plan_slot_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","plan_slot_snapshot_id") REFERENCES "assignment_plan_slot_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_assignment_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "assignments"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_team_fk" FOREIGN KEY ("organization_id","team_id") REFERENCES "teams"("organization_id","id");--> statement-breakpoint
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_athlete_membership_fk" FOREIGN KEY ("organization_id","athlete_user_id") REFERENCES "organization_memberships"("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "assignment_workout_block_snapshots" ADD CONSTRAINT "assignment_workout_block_snapshots_workout_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","workout_snapshot_id") REFERENCES "assignment_workout_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_workout_block_snapshots" ADD CONSTRAINT "assignment_workout_block_snapshots_source_block_fk" FOREIGN KEY ("source_block_id") REFERENCES "workout_blocks"("id");--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD CONSTRAINT "assignment_workout_item_snapshots_block_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","block_snapshot_id") REFERENCES "assignment_workout_block_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD CONSTRAINT "assignment_workout_item_snapshots_source_item_fk" FOREIGN KEY ("source_item_id") REFERENCES "workout_items"("id");--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD CONSTRAINT "assignment_workout_item_snapshots_source_exercise_fk" FOREIGN KEY ("organization_id","source_exercise_id") REFERENCES "exercises"("organization_id","id");--> statement-breakpoint
ALTER TABLE "assignment_workout_snapshots" ADD CONSTRAINT "assignment_workout_snapshots_assignment_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "assignments"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_workout_snapshots" ADD CONSTRAINT "assignment_workout_snapshots_source_workout_fk" FOREIGN KEY ("organization_id","source_workout_id") REFERENCES "workouts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_plan_fk" FOREIGN KEY ("organization_id","source_plan_id") REFERENCES "plans"("organization_id","id");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_workout_fk" FOREIGN KEY ("organization_id","source_workout_id") REFERENCES "workouts"("organization_id","id");