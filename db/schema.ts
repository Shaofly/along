import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: userRole("role").default("member").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "ready",
  "used",
  "revoked",
  "expired",
]);

export const sponsorStatus = pgEnum("sponsor_status", [
  "pending",
  "confirmed",
  "declined",
]);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    encryptedCode: text("encrypted_code").notNull(),
    invitedEmail: text("invited_email").notNull(),
    invitedName: text("invited_name"),
    status: invitationStatus("status").default("pending").notNull(),
    requiredSponsorCount: integer("required_sponsor_count")
      .default(2)
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id),
    usedById: text("used_by_id").references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invitations_code_hash_idx").on(table.codeHash),
    index("invitations_invited_email_idx").on(table.invitedEmail),
    index("invitations_created_by_idx").on(table.createdById),
  ],
);

export const invitationSponsors = pgTable(
  "invitation_sponsors",
  {
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    status: sponsorStatus("status").default("pending").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.userId] }),
    index("invitation_sponsors_user_idx").on(table.userId),
  ],
);

export const friendships = pgTable(
  "friendships",
  {
    id: text("id").primaryKey(),
    userOneId: text("user_one_id")
      .notNull()
      .references(() => user.id),
    userTwoId: text("user_two_id")
      .notNull()
      .references(() => user.id),
    sourceInvitationId: text("source_invitation_id").references(
      () => invitations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(table.userOneId, table.userTwoId),
    index("friendships_user_one_idx").on(table.userOneId),
    index("friendships_user_two_idx").on(table.userTwoId),
  ],
);
