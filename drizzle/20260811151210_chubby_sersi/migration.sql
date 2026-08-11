ALTER TABLE "plan_schedule_slots" DROP CONSTRAINT "plan_schedule_slots_plan_week_day_position_unique";--> statement-breakpoint
ALTER TABLE "plan_schedule_slots" DROP CONSTRAINT "plan_schedule_slots_cycle_week_positive";--> statement-breakpoint
ALTER TABLE "plan_schedule_slots" DROP COLUMN "cycle_week";--> statement-breakpoint
ALTER TABLE "plan_schedule_slots" ADD CONSTRAINT "plan_schedule_slots_plan_day_position_unique" UNIQUE("plan_id","day_of_week","position");