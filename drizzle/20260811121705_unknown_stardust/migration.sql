CREATE TYPE "exercise_category" AS ENUM('strength', 'power', 'conditioning', 'mobility', 'warmup', 'recovery', 'other');--> statement-breakpoint
CREATE TYPE "exercise_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "workout_block_type" AS ENUM('straight', 'circuit', 'superset');--> statement-breakpoint
CREATE TYPE "workout_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instructions" text,
	"category" "exercise_category" DEFAULT 'other'::"exercise_category" NOT NULL,
	"equipment" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"video_url" text,
	"status" "exercise_status" DEFAULT 'active'::"exercise_status" NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "workout_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"type" "workout_block_type" DEFAULT 'straight'::"workout_block_type" NOT NULL,
	"label" text,
	"rounds" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "workout_blocks_organization_workout_id_unique" UNIQUE("organization_id","workout_id","id"),
	CONSTRAINT "workout_blocks_workout_position_unique" UNIQUE("workout_id","position"),
	CONSTRAINT "workout_blocks_rounds_positive" CHECK ("rounds" > 0),
	CONSTRAINT "workout_blocks_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reps" integer,
	"load" text,
	"duration_seconds" integer,
	"distance_meters" integer,
	"rest_seconds" integer,
	"tempo" text,
	"notes" text,
	CONSTRAINT "workout_items_block_position_unique" UNIQUE("block_id","position"),
	CONSTRAINT "workout_items_reps_nonnegative" CHECK ("reps" IS NULL OR "reps" >= 0),
	CONSTRAINT "workout_items_duration_nonnegative" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
	CONSTRAINT "workout_items_distance_nonnegative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0),
	CONSTRAINT "workout_items_rest_nonnegative" CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0),
	CONSTRAINT "workout_items_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"source_workout_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" "workout_status" DEFAULT 'draft'::"workout_status" NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "workouts_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_active_name_unique" ON "exercises" ("organization_id",lower("name")) WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "exercises_organization_status_name_idx" ON "exercises" ("organization_id","status","name");--> statement-breakpoint
CREATE INDEX "workout_blocks_workout_idx" ON "workout_blocks" ("workout_id");--> statement-breakpoint
CREATE INDEX "workout_items_block_idx" ON "workout_items" ("block_id");--> statement-breakpoint
CREATE INDEX "workout_items_exercise_idx" ON "workout_items" ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_unarchived_name_unique" ON "workouts" ("organization_id",lower("name")) WHERE "status" <> 'archived';--> statement-breakpoint
CREATE INDEX "workouts_organization_status_name_idx" ON "workouts" ("organization_id","status","name");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_workout_fk" FOREIGN KEY ("organization_id","workout_id") REFERENCES "workouts"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_block_fk" FOREIGN KEY ("organization_id","workout_id","block_id") REFERENCES "workout_blocks"("organization_id","workout_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_exercise_fk" FOREIGN KEY ("organization_id","exercise_id") REFERENCES "exercises"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_source_workout_fk" FOREIGN KEY ("organization_id","source_workout_id") REFERENCES "workouts"("organization_id","id");