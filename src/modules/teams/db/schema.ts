import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { teamRoles } from "@/modules/access-control/roles";
import {
  organizationMemberships,
  organizations,
} from "@/modules/organizations/db/schema";
import { users } from "@/modules/users/db/schema";

export const teamRole = pgEnum("team_role", teamRoles);
export const teamInvitationStatus = pgEnum("team_invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const teams = pgTable(
  "teams",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("teams_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    index("teams_organization_idx").on(table.organizationId),
  ],
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: teamRole().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: "team_memberships_team_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [
        organizationMemberships.organizationId,
        organizationMemberships.userId,
      ],
      name: "team_memberships_organization_membership_fk",
    }).onDelete("cascade"),
    index("team_memberships_organization_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id").notNull(),
    invitedEmail: text("invited_email").notNull(),
    role: teamRole().notNull(),
    status: teamInvitationStatus().default("pending").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: "team_invitations_team_fk",
    }).onDelete("cascade"),
    uniqueIndex("team_invitations_token_hash_idx").on(table.tokenHash),
    uniqueIndex("team_invitations_pending_email_idx")
      .on(table.organizationId, table.teamId, table.invitedEmail)
      .where(sql`${table.status} = 'pending'`),
    index("team_invitations_team_idx").on(table.organizationId, table.teamId),
    check(
      "team_invitations_normalized_email_check",
      sql`${table.invitedEmail} = lower(trim(${table.invitedEmail}))`,
    ),
  ],
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;
export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;
