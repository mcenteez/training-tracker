CREATE TABLE "organization_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "organization_audit_events_organization_idx" ON "organization_audit_events" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_audit_events_actor_idx" ON "organization_audit_events" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "organization_audit_events_action_idx" ON "organization_audit_events" ("action");--> statement-breakpoint
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_audit_events" ADD CONSTRAINT "organization_audit_events_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL;