CREATE TYPE "team_invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"role" "team_role" NOT NULL,
	"status" "team_invitation_status" DEFAULT 'pending'::"team_invitation_status" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_normalized_email_check" CHECK ("invited_email" = lower(trim("invited_email")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_token_hash_idx" ON "team_invitations" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_pending_email_idx" ON "team_invitations" ("organization_id","team_id","invited_email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "team_invitations_team_idx" ON "team_invitations" ("organization_id","team_id");--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_accepted_by_user_id_users_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_fk" FOREIGN KEY ("organization_id","team_id") REFERENCES "teams"("organization_id","id") ON DELETE CASCADE;