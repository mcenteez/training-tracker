CREATE TYPE "resistance_type" AS ENUM('fixed_weight', 'percent_1rm', 'bodyweight', 'band', 'rpe', 'rir', 'free_text');--> statement-breakpoint
CREATE TYPE "resistance_unit" AS ENUM('kg', 'lb');--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_type" "resistance_type";--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_unit" "resistance_unit";--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_percentage" numeric;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_target" numeric;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "resistance_description" text;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD COLUMN "normalized_resistance_kg" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_type" "resistance_type";--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_unit" "resistance_unit";--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_percentage" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_target" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "resistance_description" text;--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD COLUMN "normalized_resistance_kg" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_type" "resistance_type";--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_unit" "resistance_unit";--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_percentage" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_target" numeric;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "resistance_description" text;--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD COLUMN "normalized_resistance_kg" numeric;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_type" "resistance_type";--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_value" numeric;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_unit" "resistance_unit";--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_percentage" numeric;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_target" numeric;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "resistance_description" text;--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD COLUMN "normalized_resistance_kg" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_type" "resistance_type";--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_value" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_unit" "resistance_unit";--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_percentage" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_target" numeric;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "resistance_description" text;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "normalized_resistance_kg" numeric;--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" ADD CONSTRAINT "assignment_athlete_item_overrides_resistance_shape" CHECK ((
		"resistance_type" IS NULL
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'fixed_weight'
		AND "resistance_value" > 0
		AND "resistance_unit" IS NOT NULL
		AND "normalized_resistance_kg" > 0
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
	) OR (
		"resistance_type" = 'percent_1rm'
		AND "resistance_percentage" > 0
		AND "resistance_percentage" <= 200
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'bodyweight'
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" IN ('band', 'free_text')
		AND length(trim("resistance_description")) > 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rpe'
		AND "resistance_target" >= 1
		AND "resistance_target" <= 10
		AND mod("resistance_target" * 2, 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rir'
		AND "resistance_target" >= 0
		AND "resistance_target" <= 10
		AND mod("resistance_target", 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	));--> statement-breakpoint
ALTER TABLE "assignment_session_effective_item_prescriptions" ADD CONSTRAINT "assignment_session_effective_item_prescriptions_resistance_shape" CHECK ((
		"resistance_type" IS NULL
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'fixed_weight'
		AND "resistance_value" > 0
		AND "resistance_unit" IS NOT NULL
		AND "normalized_resistance_kg" > 0
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
	) OR (
		"resistance_type" = 'percent_1rm'
		AND "resistance_percentage" > 0
		AND "resistance_percentage" <= 200
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'bodyweight'
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" IN ('band', 'free_text')
		AND length(trim("resistance_description")) > 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rpe'
		AND "resistance_target" >= 1
		AND "resistance_target" <= 10
		AND mod("resistance_target" * 2, 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rir'
		AND "resistance_target" >= 0
		AND "resistance_target" <= 10
		AND mod("resistance_target", 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	));--> statement-breakpoint
ALTER TABLE "assignment_session_item_results" ADD CONSTRAINT "assignment_session_item_results_resistance_shape" CHECK ((
		"resistance_type" IS NULL
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'fixed_weight'
		AND "resistance_value" > 0
		AND "resistance_unit" IS NOT NULL
		AND "normalized_resistance_kg" > 0
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
	) OR (
		"resistance_type" = 'percent_1rm'
		AND "resistance_percentage" > 0
		AND "resistance_percentage" <= 200
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'bodyweight'
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" IN ('band', 'free_text')
		AND length(trim("resistance_description")) > 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rpe'
		AND "resistance_target" >= 1
		AND "resistance_target" <= 10
		AND mod("resistance_target" * 2, 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rir'
		AND "resistance_target" >= 0
		AND "resistance_target" <= 10
		AND mod("resistance_target", 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	));--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots" ADD CONSTRAINT "assignment_workout_item_snapshots_resistance_shape" CHECK ((
		"resistance_type" IS NULL
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'fixed_weight'
		AND "resistance_value" > 0
		AND "resistance_unit" IS NOT NULL
		AND "normalized_resistance_kg" > 0
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
	) OR (
		"resistance_type" = 'percent_1rm'
		AND "resistance_percentage" > 0
		AND "resistance_percentage" <= 200
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'bodyweight'
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" IN ('band', 'free_text')
		AND length(trim("resistance_description")) > 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rpe'
		AND "resistance_target" >= 1
		AND "resistance_target" <= 10
		AND mod("resistance_target" * 2, 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rir'
		AND "resistance_target" >= 0
		AND "resistance_target" <= 10
		AND mod("resistance_target", 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	));--> statement-breakpoint
ALTER TABLE "workout_items" ADD CONSTRAINT "workout_items_resistance_shape" CHECK ((
		"resistance_type" IS NULL
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'fixed_weight'
		AND "resistance_value" > 0
		AND "resistance_unit" IS NOT NULL
		AND "normalized_resistance_kg" > 0
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
	) OR (
		"resistance_type" = 'percent_1rm'
		AND "resistance_percentage" > 0
		AND "resistance_percentage" <= 200
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'bodyweight'
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" IN ('band', 'free_text')
		AND length(trim("resistance_description")) > 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_target" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rpe'
		AND "resistance_target" >= 1
		AND "resistance_target" <= 10
		AND mod("resistance_target" * 2, 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	) OR (
		"resistance_type" = 'rir'
		AND "resistance_target" >= 0
		AND "resistance_target" <= 10
		AND mod("resistance_target", 1) = 0
		AND "resistance_value" IS NULL
		AND "resistance_unit" IS NULL
		AND "resistance_percentage" IS NULL
		AND "resistance_description" IS NULL
		AND "normalized_resistance_kg" IS NULL
	));--> statement-breakpoint
ALTER TABLE "assignment_athlete_item_overrides" DROP CONSTRAINT "assignment_athlete_item_overrides_fields_supported", ADD CONSTRAINT "assignment_athlete_item_overrides_fields_supported" CHECK ("overridden_fields" <@ ARRAY['reps', 'load', 'resistance', 'durationSeconds', 'distanceMeters', 'restSeconds', 'tempo', 'notes']::text[]);