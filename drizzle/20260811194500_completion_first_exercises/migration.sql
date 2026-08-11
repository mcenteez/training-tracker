--> statement-breakpoint
ALTER TABLE "assignment_session_item_results"
ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone DEFAULT now() NOT NULL;
