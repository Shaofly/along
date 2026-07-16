CREATE TYPE "public"."circle_approval_decision" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."circle_management_mode" AS ENUM('creator', 'circle');--> statement-breakpoint
CREATE TYPE "public"."circle_proposal_kind" AS ENUM('initial', 'add', 'rejoin');--> statement-breakpoint
CREATE TYPE "public"."circle_proposal_status" AS ENUM('pending_approval', 'awaiting_candidate', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."circle_status" AS ENUM('forming', 'active', 'dissolved');--> statement-breakpoint
CREATE TABLE "circle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_join_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"proposer_id" text NOT NULL,
	"kind" "circle_proposal_kind" NOT NULL,
	"allow_history" boolean DEFAULT true NOT NULL,
	"status" "circle_proposal_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circle_membership_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"visible_from" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circle_post_snapshots" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_edited_by_id" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_post_snapshots_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "circle_proposal_approvals" (
	"proposal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"decision" "circle_approval_decision" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "circle_proposal_approvals_proposal_id_user_id_pk" PRIMARY KEY("proposal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "circle_status" DEFAULT 'forming' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "circle_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "management_mode" "circle_management_mode" DEFAULT 'creator' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "last_edited_by_id" text;--> statement-breakpoint
ALTER TABLE "circle_events" ADD CONSTRAINT "circle_events_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_events" ADD CONSTRAINT "circle_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_join_proposals_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_join_proposals_candidate_id_user_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_join_proposals_proposer_id_user_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_periods_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_periods_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_post_snapshots" ADD CONSTRAINT "circle_post_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_post_snapshots" ADD CONSTRAINT "circle_post_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_post_snapshots" ADD CONSTRAINT "circle_post_snapshots_last_edited_by_id_user_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_proposal_approvals" ADD CONSTRAINT "circle_proposal_approvals_proposal_id_circle_join_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."circle_join_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_proposal_approvals" ADD CONSTRAINT "circle_proposal_approvals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_events_circle_created_idx" ON "circle_events" USING btree ("circle_id","created_at");--> statement-breakpoint
CREATE INDEX "circle_proposals_circle_status_idx" ON "circle_join_proposals" USING btree ("circle_id","status");--> statement-breakpoint
CREATE INDEX "circle_proposals_candidate_status_idx" ON "circle_join_proposals" USING btree ("candidate_id","status");--> statement-breakpoint
CREATE INDEX "circle_membership_circle_user_idx" ON "circle_membership_periods" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX "circle_membership_user_period_idx" ON "circle_membership_periods" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_membership_active_user_idx" ON "circle_membership_periods" USING btree ("circle_id","user_id") WHERE "circle_membership_periods"."left_at" is null;--> statement-breakpoint
CREATE INDEX "circle_snapshots_user_idx" ON "circle_post_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "circle_approvals_user_decision_idx" ON "circle_proposal_approvals" USING btree ("user_id","decision");--> statement-breakpoint
CREATE INDEX "circles_status_updated_idx" ON "circles" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "circles_created_by_idx" ON "circles" USING btree ("created_by_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_last_edited_by_id_user_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_circle_created_idx" ON "posts" USING btree ("circle_id","created_at");