import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["admin", "member"]);

export const postVisibility = pgEnum("post_visibility", [
  "friends",
  "selected",
  "private",
]);

export const postPublicationStatus = pgEnum("post_publication_status", [
  "publishing",
  "published",
  "failed",
]);

export const mediaStatus = pgEnum("media_status", [
  "uploaded",
  "processing",
  "ready",
  "failed",
  "deleting",
]);

export const mediaVariantType = pgEnum("media_variant_type", [
  "thumbnail",
  "preview",
  "hd",
]);

export const mediaUploadStatus = pgEnum("media_upload_status", [
  "issued",
  "uploading",
  "uploaded",
  "verified",
  "expired",
  "failed",
]);

export const mediaJobStatus = pgEnum("media_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const circleStatus = pgEnum("circle_status", [
  "forming",
  "active",
  "dissolved",
]);

export const circleProposalKind = pgEnum("circle_proposal_kind", [
  "initial",
  "add",
  "rejoin",
]);

export const circleProposalStatus = pgEnum("circle_proposal_status", [
  "pending_approval",
  "awaiting_candidate",
  "accepted",
  "declined",
  "expired",
]);

export const circleApprovalDecision = pgEnum("circle_approval_decision", [
  "pending",
  "approved",
  "declined",
]);

export const circleManagementMode = pgEnum("circle_management_mode", [
  "creator",
  "circle",
]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    realName: text("real_name").notNull(),
    nickname: text("nickname"),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    bio: text("bio").default("").notNull(),
    role: userRole("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_email_lower_idx").on(sql`lower(${table.email})`),
    check("user_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("user_real_name_not_blank", sql`btrim(${table.realName}) <> ''`),
    check(
      "user_nickname_not_blank",
      sql`${table.nickname} is null or btrim(${table.nickname}) <> ''`,
    ),
    check("user_email_normalized", sql`${table.email} = lower(btrim(${table.email}))`),
    check("user_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

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
  (table) => [
    index("session_user_id_idx").on(table.userId),
    check("session_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
    check("session_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
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
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
    check("account_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
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
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    check("verification_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
    check("verification_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
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
    check(
      "invitations_sponsor_count_range",
      sql`${table.requiredSponsorCount} between 2 and 5`,
    ),
    check(
      "invitations_email_normalized",
      sql`${table.invitedEmail} = lower(btrim(${table.invitedEmail}))`,
    ),
    check("invitations_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "invitations_usage_consistent",
      sql`(${table.status} = 'used' and ${table.usedById} is not null and ${table.usedAt} is not null)
        or (${table.status} <> 'used' and ${table.usedById} is null and ${table.usedAt} is null)`,
    ),
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
    check(
      "invitation_sponsors_response_consistent",
      sql`(${table.status} = 'pending' and ${table.respondedAt} is null)
        or (${table.status} <> 'pending' and ${table.respondedAt} is not null)`,
    ),
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
    uniqueIndex("friendships_unordered_pair_idx").on(
      sql`least(${table.userOneId}, ${table.userTwoId})`,
      sql`greatest(${table.userOneId}, ${table.userTwoId})`,
    ),
    index("friendships_user_one_idx").on(table.userOneId),
    index("friendships_user_two_idx").on(table.userTwoId),
    check("friendships_distinct_users", sql`${table.userOneId} <> ${table.userTwoId}`),
  ],
);

export const friendRemarks = pgTable(
  "friend_remarks",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    remark: text("remark").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.friendId] }),
    index("friend_remarks_friend_idx").on(table.friendId),
    check("friend_remarks_distinct_users", sql`${table.ownerId} <> ${table.friendId}`),
    check("friend_remarks_not_blank", sql`btrim(${table.remark}) <> ''`),
    check("friend_remarks_length", sql`char_length(${table.remark}) <= 40`),
  ],
);

export const circles = pgTable(
  "circles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    status: circleStatus("status").default("forming").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
  },
  (table) => [
    index("circles_status_updated_idx").on(table.status, table.updatedAt),
    index("circles_created_by_idx").on(table.createdById),
    check("circles_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("circles_name_length", sql`char_length(${table.name}) <= 80`),
    check("circles_description_length", sql`char_length(${table.description}) <= 500`),
    check("circles_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
    check(
      "circles_dissolution_consistent",
      sql`(${table.status} = 'dissolved' and ${table.dissolvedAt} is not null)
        or (${table.status} <> 'dissolved' and ${table.dissolvedAt} is null)`,
    ),
  ],
);

export const circleMembershipPeriods = pgTable(
  "circle_membership_periods",
  {
    id: text("id").primaryKey(),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    visibleFrom: timestamp("visible_from", { withTimezone: true }),
    circleNickname: text("circle_nickname"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    index("circle_membership_circle_user_idx").on(table.circleId, table.userId),
    index("circle_membership_user_period_idx").on(table.userId, table.joinedAt),
    uniqueIndex("circle_membership_active_user_idx")
      .on(table.circleId, table.userId)
      .where(sql`${table.leftAt} is null`),
    check(
      "circle_membership_period_ordered",
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
    check(
      "circle_membership_visibility_ordered",
      sql`${table.visibleFrom} is null or ${table.visibleFrom} <= ${table.joinedAt}`,
    ),
    check(
      "circle_membership_viewed_ordered",
      sql`${table.lastViewedAt} >= ${table.joinedAt}`,
    ),
    check(
      "circle_membership_nickname_not_blank",
      sql`${table.circleNickname} is null or btrim(${table.circleNickname}) <> ''`,
    ),
    check(
      "circle_membership_nickname_length",
      sql`${table.circleNickname} is null or char_length(${table.circleNickname}) <= 40`,
    ),
  ],
);

export const circleJoinProposals = pgTable(
  "circle_join_proposals",
  {
    id: text("id").primaryKey(),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => user.id),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => user.id),
    kind: circleProposalKind("kind").notNull(),
    allowHistory: boolean("allow_history").default(true).notNull(),
    status: circleProposalStatus("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("circle_proposals_circle_status_idx").on(table.circleId, table.status),
    index("circle_proposals_candidate_status_idx").on(table.candidateId, table.status),
    uniqueIndex("circle_proposals_active_candidate_idx")
      .on(table.circleId, table.candidateId)
      .where(sql`${table.status} in ('pending_approval', 'awaiting_candidate')`),
    check(
      "circle_proposals_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "circle_proposals_resolution_consistent",
      sql`(${table.status} in ('pending_approval', 'awaiting_candidate') and ${table.resolvedAt} is null)
        or (${table.status} in ('accepted', 'declined', 'expired') and ${table.resolvedAt} is not null)`,
    ),
  ],
);

export const circleProposalApprovals = pgTable(
  "circle_proposal_approvals",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => circleJoinProposals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    decision: circleApprovalDecision("decision").default("pending").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.userId] }),
    index("circle_approvals_user_decision_idx").on(table.userId, table.decision),
    check(
      "circle_approvals_response_consistent",
      sql`(${table.decision} = 'pending' and ${table.respondedAt} is null)
        or (${table.decision} <> 'pending' and ${table.respondedAt} is not null)`,
    ),
  ],
);

export const circleEvents = pgTable(
  "circle_events",
  {
    id: text("id").primaryKey(),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id),
    type: text("type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("circle_events_circle_created_idx").on(table.circleId, table.createdAt),
    check("circle_events_type_not_blank", sql`btrim(${table.type}) <> ''`),
    check("circle_events_message_not_blank", sql`btrim(${table.message}) <> ''`),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    circleId: text("circle_id").references(() => circles.id),
    body: text("body").default("").notNull(),
    visibility: postVisibility("visibility").default("friends").notNull(),
    managementMode: circleManagementMode("management_mode")
      .default("creator")
      .notNull(),
    publicationStatus: postPublicationStatus("publication_status")
      .default("published")
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publicationError: text("publication_error"),
    lastEditedById: text("last_edited_by_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("posts_author_created_idx").on(table.authorId, table.createdAt),
    index("posts_circle_created_idx").on(table.circleId, table.createdAt),
    index("posts_created_idx").on(table.createdAt),
    index("posts_publication_created_idx").on(table.publicationStatus, table.createdAt),
    check("posts_body_length", sql`char_length(${table.body}) <= 5000`),
    check("posts_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
    check(
      "posts_personal_management_mode",
      sql`${table.circleId} is not null or ${table.managementMode} = 'creator'`,
    ),
    check(
      "posts_circle_visibility",
      sql`${table.circleId} is null or ${table.visibility} = 'private'`,
    ),
    check(
      "posts_publication_error_consistent",
      sql`${table.publicationStatus} = 'failed' or ${table.publicationError} is null`,
    ),
    check(
      "posts_published_at_consistent",
      sql`${table.publicationStatus} <> 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const drafts = pgTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    circleId: text("circle_id").references(() => circles.id),
    body: text("body").default("").notNull(),
    visibility: postVisibility("visibility").default("friends").notNull(),
    managementMode: circleManagementMode("management_mode")
      .default("creator")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("drafts_author_updated_idx").on(table.authorId, table.updatedAt),
    index("drafts_circle_idx").on(table.circleId),
    check("drafts_body_length", sql`char_length(${table.body}) <= 5000`),
    check("drafts_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
    check(
      "drafts_personal_management_mode",
      sql`${table.circleId} is not null or ${table.managementMode} = 'creator'`,
    ),
    check(
      "drafts_circle_visibility",
      sql`${table.circleId} is null or ${table.visibility} = 'private'`,
    ),
  ],
);

export const draftViewers = pgTable(
  "draft_viewers",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.userId] }),
    index("draft_viewers_user_idx").on(table.userId),
  ],
);

export const circlePostSnapshots = pgTable(
  "circle_post_snapshots",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    lastEditedById: text("last_edited_by_id").references(() => user.id),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("circle_snapshots_user_idx").on(table.userId),
    check(
      "circle_snapshots_capture_ordered",
      sql`${table.capturedAt} >= ${table.updatedAt}`,
    ),
  ],
);

export const postViewers = pgTable(
  "post_viewers",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("post_viewers_user_idx").on(table.userId),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    status: mediaStatus("status").default("ready").notNull(),
    sourceMimeType: text("source_mime_type"),
    sourceByteSize: bigint("source_byte_size", { mode: "number" }),
    sourceWidth: integer("source_width"),
    sourceHeight: integer("source_height"),
    readyAt: timestamp("ready_at", { withTimezone: true }).defaultNow(),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("media_assets_owner_idx").on(table.ownerId),
    index("media_assets_owner_status_idx").on(table.ownerId, table.status),
    check("media_assets_positive_size", sql`${table.byteSize} > 0`),
    check(
      "media_assets_source_size_positive",
      sql`${table.sourceByteSize} is null or ${table.sourceByteSize} > 0`,
    ),
    check(
      "media_assets_source_dimensions_positive",
      sql`(${table.sourceWidth} is null and ${table.sourceHeight} is null)
        or (${table.sourceWidth} > 0 and ${table.sourceHeight} > 0)`,
    ),
    check(
      "media_assets_ready_consistent",
      sql`${table.status} <> 'ready' or ${table.readyAt} is not null`,
    ),
    check(
      "media_assets_failure_consistent",
      sql`${table.status} = 'failed' or ${table.failureCode} is null`,
    ),
    check("media_assets_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const mediaVariants = pgTable(
  "media_variants",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    variantType: mediaVariantType("variant_type").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    etag: text("etag"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mediaId, table.variantType] }),
    index("media_variants_media_idx").on(table.mediaId),
    check("media_variants_positive_size", sql`${table.byteSize} > 0`),
    check(
      "media_variants_positive_dimensions",
      sql`${table.width} > 0 and ${table.height} > 0`,
    ),
  ],
);

export const mediaUploadSessions = pgTable(
  "media_upload_sessions",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    incomingKey: text("incoming_key").notNull().unique(),
    status: mediaUploadStatus("status").default("issued").notNull(),
    expectedMimeType: text("expected_mime_type").notNull(),
    expectedByteSize: bigint("expected_byte_size", { mode: "number" }).notNull(),
    objectEtag: text("object_etag"),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("media_upload_sessions_owner_status_idx").on(table.ownerId, table.status),
    index("media_upload_sessions_expiry_idx").on(table.expiresAt),
    check("media_upload_sessions_positive_size", sql`${table.expectedByteSize} > 0`),
    check(
      "media_upload_sessions_completion_consistent",
      sql`${table.status} not in ('verified', 'failed', 'expired')
        or ${table.completedAt} is not null`,
    ),
  ],
);

export const mediaProcessingJobs = pgTable(
  "media_processing_jobs",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    uploadSessionId: text("upload_session_id")
      .references(() => mediaUploadSessions.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    providerJobId: text("provider_job_id"),
    status: mediaJobStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("media_processing_jobs_media_created_idx").on(table.mediaId, table.createdAt),
    index("media_processing_jobs_status_idx").on(table.status, table.createdAt),
    check("media_processing_jobs_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check(
      "media_processing_jobs_completion_consistent",
      sql`${table.status} not in ('completed', 'failed') or ${table.completedAt} is not null`,
    ),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.mediaId] }),
    uniqueIndex("post_media_position_idx").on(table.postId, table.position),
    uniqueIndex("post_media_media_idx").on(table.mediaId),
    check("post_media_position_range", sql`${table.position} between 0 and 19`),
  ],
);

export const draftMedia = pgTable(
  "draft_media",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.mediaId] }),
    uniqueIndex("draft_media_position_idx").on(table.draftId, table.position),
    uniqueIndex("draft_media_media_idx").on(table.mediaId),
    check("draft_media_position_range", sql`${table.position} between 0 and 19`),
  ],
);
