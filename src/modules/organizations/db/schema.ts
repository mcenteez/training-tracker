import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizationRoles } from "@/modules/access-control/roles";
import { users } from "@/modules/users/db/schema";

export const organizationRole = pgEnum("organization_role", organizationRoles);
export const organizationInvitationStatus = pgEnum(
  "organization_invitation_status",
  ["pending", "accepted", "revoked", "expired"],
);

export const organizations = pgTable("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  timezone: text().default("UTC").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRole().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    uniqueIndex("organization_memberships_single_owner_idx")
      .on(table.organizationId)
      .where(sql`${table.role} = 'owner'`),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    role: organizationRole().notNull(),
    status: organizationInvitationStatus().default("pending").notNull(),
    token: text().notNull(),
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
    uniqueIndex("organization_invitations_token_idx").on(table.token),
    uniqueIndex("organization_invitations_pending_email_idx")
      .on(table.organizationId, table.invitedEmail)
      .where(sql`${table.status} = 'pending'`),
    index("organization_invitations_organization_idx").on(table.organizationId),
  ],
);

export const organizationAuditEvents = pgTable(
  "organization_audit_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text().notNull(),
    details: jsonb(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("organization_audit_events_organization_idx").on(
      table.organizationId,
    ),
    index("organization_audit_events_actor_idx").on(table.actorUserId),
    index("organization_audit_events_action_idx").on(table.action),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMembership =
  typeof organizationMemberships.$inferSelect;
export type NewOrganizationMembership =
  typeof organizationMemberships.$inferInsert;
export type OrganizationInvitation =
  typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation =
  typeof organizationInvitations.$inferInsert;
export type OrganizationAuditEvent =
  typeof organizationAuditEvents.$inferSelect;
export type NewOrganizationAuditEvent =
  typeof organizationAuditEvents.$inferInsert;
