CREATE TYPE "strength_load_unit" AS ENUM('kg', 'lb');--> statement-breakpoint
CREATE TABLE "assignment_athlete_item_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"athlete_user_id" uuid NOT NULL,
	"item_snapshot_id" uuid NOT NULL,
	"plan_slot_snapshot_id" uuid,
	"reps" integer,
	"load" text,
	"load_value" numeric,
	"load_unit" "strength_load_unit",
	"normalized_load_kg" numeric,
	"duration_seconds" integer,
	"distance_meters" integer,
	"rest_seconds" integer,
	"tempo" text,
	"notes" text,
	"reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_athlete_item_overrides_reps_nonnegative" CHECK ("reps" IS NULL OR "reps" >= 0),
	CONSTRAINT "assignment_athlete_item_overrides_duration_nonnegative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
	CONSTRAINT "assignment_athlete_item_overrides_distance_nonnegative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0),
	CONSTRAINT "assignment_athlete_item_overrides_rest_nonnegative" CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0),
	CONSTRAINT "assignment_athlete_item_overrides_structured_load_complete" CHECK ((
        "load_value" IS NULL
        AND "load_unit" IS NULL
        AND "normalized_load_kg" IS NULL
      ) OR (
        "load_value" > 0
        AND "load_unit" IS NOT NULL
        AND "normalized_load_kg" > 0
      )),
	CONSTRAINT "assignment_athlete_item_overrides_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_session_effective_item_prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"item_snapshot_id" uuid NOT NULL,
	"source_override_id" uuid,
	"reps" integer,
	"load" text,
	"load_value" numeric,
	"load_unit" "strength_load_unit",
	"normalized_load_kg" numeric,
	"duration_seconds" integer,
	"distance_meters" integer,
	"rest_seconds" integer,
	"tempo" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_session_effective_item_prescriptions_session_item_unique" UNIQUE("session_id","item_snapshot_id"),
	CONSTRAINT "assignment_session_effective_item_prescriptions_reps_nonnegative" CHECK ("reps" IS NULL OR "reps" >= 0),
	CONSTRAINT "assignment_session_effective_item_prescriptions_duration_nonnegative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
	CONSTRAINT "assignment_session_effective_item_prescriptions_distance_nonnegative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0),
	CONSTRAINT "assignment_session_effective_item_prescriptions_rest_nonnegative" CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0),
	CONSTRAINT "assignment_session_effective_item_prescriptions_structured_load_complete" CHECK ((
        "load_value" IS NULL
        AND "load_unit" IS NULL
        AND "normalized_load_kg" IS NULL
      ) OR (
        "load_value" > 0
        AND "load_unit" IS NOT NULL
        AND "normalized_load_kg" > 0
      ))
);
--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "load_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "load_unit" "strength_load_unit";--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "normalized_load_kg" numeric;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD COLUMN "session_rpe" integer;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "load_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "load_unit" "strength_load_unit";--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "normalized_load_kg" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "load_value" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "load_unit" "strength_load_unit";--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "normalized_load_kg" numeric;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_athlete_item_overrides_recipient_item_slot_unique" ON "assignment_athlete_item_overrides" ("recipient_id","item_snapshot_id",coalesce("plan_slot_snapshot_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "assignment_athlete_item_overrides_recipient_idx" ON "assignment_athlete_item_overrides" ("organization_id","recipient_id");--> statement-breakpoint
CREATE INDEX "assignment_session_effective_item_prescriptions_session_idx" ON "assignment_session_effective_item_prescriptions" ("session_id");--> statement-breakpoint
CREATE INDEX "assignment_sessions_athlete_submitted_idx" ON "assignment_sessions" ("organization_id","athlete_user_id","submitted_at");--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_athlete_user_id_users_id_fkey" FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_hIiVMS6QoOnj_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_Yp9WYtYbPDNi_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_recipient_fk" FOREIGN KEY ("organization_id","assignment_id","recipient_id") REFERENCES "assignment_recipients"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_item_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","item_snapshot_id") REFERENCES "assignment_workout_item_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_plan_slot_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","plan_slot_snapshot_id") REFERENCES "assignment_plan_slot_snapshots"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD CONSTRAINT "assignment_session_effective_item_prescriptions_session_fk" FOREIGN KEY ("organization_id","assignment_id","session_id") REFERENCES "assignment_sessions"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD CONSTRAINT "assignment_session_effective_item_prescriptions_item_snapshot_fk" FOREIGN KEY ("organization_id","assignment_id","item_snapshot_id") REFERENCES "assignment_workout_item_snapshots"("organization_id","assignment_id","id");--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD CONSTRAINT "assignment_session_effective_item_prescriptions_override_fk" FOREIGN KEY ("source_override_id") REFERENCES "assignment_athlete_item_overrides"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD CONSTRAINT "assignment_session_item_results_structured_load_complete" CHECK ((
        "load_value" IS NULL
        AND "load_unit" IS NULL
        AND "normalized_load_kg" IS NULL
      ) OR (
        "load_value" > 0
        AND "load_unit" IS NOT NULL
        AND "normalized_load_kg" > 0
      ));--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_duration_nonnegative" CHECK ("duration_minutes" IS NULL OR "duration_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "assignment_sessions" ADD CONSTRAINT "assignment_sessions_rpe_bounds" CHECK ("session_rpe" IS NULL OR ("session_rpe" >= 1 AND "session_rpe" <= 10));--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD CONSTRAINT "assignment_workout_item_snapshots_structured_load_complete" CHECK ((
        "load_value" IS NULL
        AND "load_unit" IS NULL
        AND "normalized_load_kg" IS NULL
      ) OR (
        "load_value" > 0
        AND "load_unit" IS NOT NULL
        AND "normalized_load_kg" > 0
      ));--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_structured_load_complete" CHECK ((
        "load_value" IS NULL
        AND "load_unit" IS NULL
        AND "normalized_load_kg" IS NULL
      ) OR (
        "load_value" > 0
        AND "load_unit" IS NOT NULL
        AND "normalized_load_kg" > 0
      ));