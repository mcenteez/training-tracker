ALTER TABLE "assignment_sessions" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "timeliness_policy_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "timeliness_policy_effective_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "fixed_due_local_minute" integer DEFAULT 1440 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "weekly_due_day" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "weekly_due_local_minute" integer DEFAULT 1440 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "late_entry_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
WITH "resolved_session_deadlines" AS (
	SELECT
		"assignment_sessions"."id" AS "session_id",
		"assignments"."timeliness_policy_effective_at" AS "effective_at",
		CASE
			WHEN "assignment_plan_slot_snapshots"."schedule_type" = 'weekly_frequency'
				THEN (
					"assignment_sessions"."scheduled_date"
					+ (8 - extract(isodow FROM "assignment_sessions"."scheduled_date")::integer)
				)::timestamp AT TIME ZONE "assignments"."timezone"
			ELSE (
				"assignment_sessions"."scheduled_date" + 1
			)::timestamp AT TIME ZONE "assignments"."timezone"
		END AS "due_at"
	FROM "assignment_sessions"
	INNER JOIN "assignments"
		ON "assignments"."organization_id" = "assignment_sessions"."organization_id"
		AND "assignments"."id" = "assignment_sessions"."assignment_id"
	LEFT JOIN "assignment_plan_slot_snapshots"
		ON "assignment_plan_slot_snapshots"."organization_id" = "assignment_sessions"."organization_id"
		AND "assignment_plan_slot_snapshots"."assignment_id" = "assignment_sessions"."assignment_id"
		AND "assignment_plan_slot_snapshots"."id" = "assignment_sessions"."plan_slot_snapshot_id"
)
UPDATE "assignment_sessions"
SET "due_at" = "resolved_session_deadlines"."due_at"
FROM "resolved_session_deadlines"
WHERE "assignment_sessions"."id" = "resolved_session_deadlines"."session_id"
	AND "assignment_sessions"."due_at" IS NULL
	AND "resolved_session_deadlines"."due_at" >= "resolved_session_deadlines"."effective_at";--> statement-breakpoint
CREATE INDEX "assignment_sessions_organization_due_at_idx" ON "assignment_sessions" ("organization_id","due_at");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_timeliness_policy_version_supported" CHECK ("timeliness_policy_version" = 1);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_fixed_due_minute_bounds" CHECK ("fixed_due_local_minute" >= 0 AND "fixed_due_local_minute" <= 1440);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_weekly_due_day_bounds" CHECK ("weekly_due_day" >= 1 AND "weekly_due_day" <= 7);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_weekly_due_minute_bounds" CHECK ("weekly_due_local_minute" >= 0 AND "weekly_due_local_minute" <= 1440);--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_late_entry_days_nonnegative" CHECK ("late_entry_days" >= 0);