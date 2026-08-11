CREATE TABLE "assignment_recipient_team_scopes" (
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"recipient_id" uuid,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_recipient_team_scopes_pkey" PRIMARY KEY("recipient_id","team_id")
);
--> statement-breakpoint
CREATE INDEX "assignment_recipient_team_scopes_team_assignment_idx" ON "assignment_recipient_team_scopes" ("organization_id","team_id","assignment_id");--> statement-breakpoint
ALTER TABLE "assignment_recipient_team_scopes" ADD CONSTRAINT "assignment_recipient_team_scopes_recipient_fk" FOREIGN KEY ("organization_id","assignment_id","recipient_id") REFERENCES "assignment_recipients"("organization_id","assignment_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assignment_recipient_team_scopes" ADD CONSTRAINT "assignment_recipient_team_scopes_team_fk" FOREIGN KEY ("organization_id","team_id") REFERENCES "teams"("organization_id","id");--> statement-breakpoint
INSERT INTO "assignment_recipient_team_scopes" (
	"organization_id", "assignment_id", "recipient_id", "team_id"
)
SELECT DISTINCT
	recipient."organization_id",
	recipient."assignment_id",
	recipient."id",
	membership."team_id"
FROM "assignment_recipients" recipient
INNER JOIN "team_memberships" membership
	ON membership."organization_id" = recipient."organization_id"
	AND membership."user_id" = recipient."athlete_user_id"
INNER JOIN "assignment_targets" target
	ON target."organization_id" = recipient."organization_id"
	AND target."assignment_id" = recipient."assignment_id"
	AND (
		(target."target_type" = 'team' AND target."team_id" = membership."team_id")
		OR
		(target."target_type" = 'athlete' AND target."athlete_user_id" = recipient."athlete_user_id")
	);