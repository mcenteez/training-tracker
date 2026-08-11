CREATE TYPE "plan_day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TYPE "plan_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "plan_schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"cycle_week" integer NOT NULL,
	"day_of_week" "plan_day_of_week" NOT NULL,
	"position" integer NOT NULL,
	"label" text,
	CONSTRAINT "plan_schedule_slots_organization_plan_id_unique" UNIQUE("organization_id","plan_id","id"),
	CONSTRAINT "plan_schedule_slots_plan_position_unique" UNIQUE("plan_id","position"),
	CONSTRAINT "plan_schedule_slots_plan_week_day_position_unique" UNIQUE("plan_id","cycle_week","day_of_week","position"),
	CONSTRAINT "plan_schedule_slots_cycle_week_positive" CHECK ("cycle_week" > 0),
	CONSTRAINT "plan_schedule_slots_position_nonnegative" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "plan_status" DEFAULT 'draft'::"plan_status" NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "plans_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "plan_schedule_slots_plan_idx" ON "plan_schedule_slots" ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_schedule_slots_workout_idx" ON "plan_schedule_slots" ("workout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_unarchived_name_unique" ON "plans" ("organization_id",lower("name")) WHERE "status" <> 'archived';--> statement-breakpoint
CREATE INDEX "plans_organization_status_name_idx" ON "plans" ("organization_id","status","name");--> statement-breakpoint
ALTER TABLE "plan_schedule_slots" ADD CONSTRAINT "plan_schedule_slots_plan_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "plans"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_schedule_slots" ADD CONSTRAINT "plan_schedule_slots_workout_fk" FOREIGN KEY ("organization_id","workout_id") REFERENCES "workouts"("organization_id","id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_user_id_users_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;