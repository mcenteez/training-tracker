ALTER TABLE "assignment_workout_block_snapshots"
  DROP CONSTRAINT "assignment_workout_block_snapshots_source_block_fk";
--> statement-breakpoint
ALTER TABLE "assignment_workout_block_snapshots"
  ADD CONSTRAINT "assignment_workout_block_snapshots_source_block_fk"
  FOREIGN KEY ("source_block_id") REFERENCES "workout_blocks"("id")
  ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots"
  DROP CONSTRAINT "assignment_workout_item_snapshots_source_item_fk";
--> statement-breakpoint
ALTER TABLE "assignment_workout_item_snapshots"
  ADD CONSTRAINT "assignment_workout_item_snapshots_source_item_fk"
  FOREIGN KEY ("source_item_id") REFERENCES "workout_items"("id")
  ON DELETE SET NULL;