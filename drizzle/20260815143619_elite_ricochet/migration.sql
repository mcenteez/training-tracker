ALTER TYPE "assignment_status" ADD VALUE 'prepared' BEFORE 'published';--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "prepared_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "preparation_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "preparation_reset_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_prepared_by_user_id_users_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_preparation_reset_by_user_id_users_id_fkey" FOREIGN KEY ("preparation_reset_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;