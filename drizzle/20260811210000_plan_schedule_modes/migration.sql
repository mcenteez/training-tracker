--> statement-breakpoint
CREATE TYPE "plan_schedule_type" AS ENUM ('fixed_day', 'weekly_frequency');
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
ADD COLUMN IF NOT EXISTS "schedule_type" "plan_schedule_type" DEFAULT 'fixed_day' NOT NULL;
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
ADD COLUMN IF NOT EXISTS "target_sessions_per_week" integer;
--> statement-breakpoint
UPDATE "plan_schedule_slots"
SET "schedule_type" = 'fixed_day'
WHERE "schedule_type" IS NULL;
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
ALTER COLUMN "day_of_week" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
DROP CONSTRAINT IF EXISTS "plan_schedule_slots_plan_day_position_unique";
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
ADD CONSTRAINT "plan_schedule_slots_schedule_shape" CHECK (
  (
    "schedule_type" = 'fixed_day'
    AND "day_of_week" IS NOT NULL
    AND "target_sessions_per_week" IS NULL
  )
  OR (
    "schedule_type" = 'weekly_frequency'
    AND "day_of_week" IS NULL
    AND "target_sessions_per_week" IS NOT NULL
  )
);
--> statement-breakpoint
ALTER TABLE "plan_schedule_slots"
ADD CONSTRAINT "plan_schedule_slots_weekly_target_bounds" CHECK (
  "target_sessions_per_week" IS NULL
  OR (
    "target_sessions_per_week" > 0
    AND "target_sessions_per_week" <= 14
  )
);
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ADD COLUMN IF NOT EXISTS "schedule_type" "plan_schedule_type" DEFAULT 'fixed_day' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ADD COLUMN IF NOT EXISTS "target_sessions_per_week" integer;
--> statement-breakpoint
UPDATE "assignment_plan_slot_snapshots"
SET "schedule_type" = 'fixed_day'
WHERE "schedule_type" IS NULL;
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ALTER COLUMN "day_of_week" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
DROP CONSTRAINT IF EXISTS "assignment_plan_slot_snapshots_assignment_day_position_unique";
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ADD CONSTRAINT "assignment_plan_slot_snapshots_assignment_position_unique" UNIQUE ("assignment_id", "position");
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ADD CONSTRAINT "assignment_plan_slot_snapshots_schedule_shape" CHECK (
  (
    "schedule_type" = 'fixed_day'
    AND "day_of_week" IS NOT NULL
    AND "target_sessions_per_week" IS NULL
  )
  OR (
    "schedule_type" = 'weekly_frequency'
    AND "day_of_week" IS NULL
    AND "target_sessions_per_week" IS NOT NULL
  )
);
--> statement-breakpoint
ALTER TABLE "assignment_plan_slot_snapshots"
ADD CONSTRAINT "assignment_plan_slot_snapshots_weekly_target_bounds" CHECK (
  "target_sessions_per_week" IS NULL
  OR (
    "target_sessions_per_week" > 0
    AND "target_sessions_per_week" <= 14
  )
);
