CREATE TABLE "circle_exit_snapshot_media" (
	"snapshot_post_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "circle_exit_snapshot_media_snapshot_post_id_media_id_pk" PRIMARY KEY("snapshot_post_id","media_id"),
	CONSTRAINT "circle_exit_snapshot_media_position_range" CHECK ("circle_exit_snapshot_media"."position" between 0 and 19)
);
--> statement-breakpoint
CREATE TABLE "circle_exit_snapshot_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"exit_snapshot_id" text NOT NULL,
	"source_post_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_edited_by_id" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_exit_snapshot_posts_body_length" CHECK (char_length("circle_exit_snapshot_posts"."body") <= 5000),
	CONSTRAINT "circle_exit_snapshot_posts_timestamps_ordered" CHECK ("circle_exit_snapshot_posts"."updated_at" >= "circle_exit_snapshot_posts"."created_at"),
	CONSTRAINT "circle_exit_snapshot_posts_capture_ordered" CHECK ("circle_exit_snapshot_posts"."captured_at" >= "circle_exit_snapshot_posts"."updated_at")
);
--> statement-breakpoint
CREATE TABLE "circle_exit_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"relation_id" text NOT NULL,
	"circle_name" text NOT NULL,
	"circle_description" text DEFAULT '' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_exit_snapshots_name_not_blank" CHECK (btrim("circle_exit_snapshots"."circle_name") <> ''),
	CONSTRAINT "circle_exit_snapshots_description_length" CHECK (char_length("circle_exit_snapshots"."circle_description") <= 500)
);
--> statement-breakpoint
CREATE TABLE "circle_member_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"history_visible_from" timestamp with time zone NOT NULL,
	"active_period_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_participants" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"added_by_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_participants_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "circle_post_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "circle_post_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "circle_membership_periods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "circle_membership_periods" CASCADE;--> statement-breakpoint
DELETE FROM "drafts" WHERE "circle_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "posts" WHERE "circle_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "circles";--> statement-breakpoint
CREATE TABLE "circle_membership_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"relation_id" text NOT NULL,
	"circle_nickname" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "circle_membership_period_ordered" CHECK ("circle_membership_periods"."left_at" is null or "circle_membership_periods"."left_at" >= "circle_membership_periods"."joined_at"),
	CONSTRAINT "circle_membership_viewed_ordered" CHECK ("circle_membership_periods"."last_viewed_at" >= "circle_membership_periods"."joined_at"),
	CONSTRAINT "circle_membership_nickname_not_blank" CHECK ("circle_membership_periods"."circle_nickname" is null or btrim("circle_membership_periods"."circle_nickname") <> ''),
	CONSTRAINT "circle_membership_nickname_length" CHECK ("circle_membership_periods"."circle_nickname" is null or char_length("circle_membership_periods"."circle_nickname") <= 40)
);
--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_media" ADD CONSTRAINT "circle_exit_snapshot_media_snapshot_post_id_circle_exit_snapshot_posts_id_fk" FOREIGN KEY ("snapshot_post_id") REFERENCES "public"."circle_exit_snapshot_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_media" ADD CONSTRAINT "circle_exit_snapshot_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_posts" ADD CONSTRAINT "circle_exit_snapshot_posts_exit_snapshot_id_circle_exit_snapshots_id_fk" FOREIGN KEY ("exit_snapshot_id") REFERENCES "public"."circle_exit_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_posts" ADD CONSTRAINT "circle_exit_snapshot_posts_source_post_id_posts_id_fk" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_posts" ADD CONSTRAINT "circle_exit_snapshot_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshot_posts" ADD CONSTRAINT "circle_exit_snapshot_posts_last_edited_by_id_user_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_exit_snapshots" ADD CONSTRAINT "circle_exit_snapshots_relation_id_circle_member_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."circle_member_relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD CONSTRAINT "circle_member_relations_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD CONSTRAINT "circle_member_relations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD CONSTRAINT "circle_member_relations_active_period_id_circle_membership_periods_id_fk" FOREIGN KEY ("active_period_id") REFERENCES "public"."circle_membership_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_participants" ADD CONSTRAINT "post_participants_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_participants" ADD CONSTRAINT "post_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_participants" ADD CONSTRAINT "post_participants_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_exit_snapshot_media_position_idx" ON "circle_exit_snapshot_media" USING btree ("snapshot_post_id","position");--> statement-breakpoint
CREATE INDEX "circle_exit_snapshot_media_media_idx" ON "circle_exit_snapshot_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "circle_exit_snapshot_posts_snapshot_created_idx" ON "circle_exit_snapshot_posts" USING btree ("exit_snapshot_id","created_at");--> statement-breakpoint
CREATE INDEX "circle_exit_snapshot_posts_source_idx" ON "circle_exit_snapshot_posts" USING btree ("source_post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_exit_snapshots_relation_idx" ON "circle_exit_snapshots" USING btree ("relation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_member_relations_circle_user_idx" ON "circle_member_relations" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX "circle_member_relations_user_active_idx" ON "circle_member_relations" USING btree ("user_id","active_period_id");--> statement-breakpoint
CREATE INDEX "circle_member_relations_circle_active_idx" ON "circle_member_relations" USING btree ("circle_id","active_period_id");--> statement-breakpoint
CREATE INDEX "post_participants_user_idx" ON "post_participants" USING btree ("user_id","post_id");--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_periods_relation_id_circle_member_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."circle_member_relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_membership_relation_period_idx" ON "circle_membership_periods" USING btree ("relation_id","joined_at");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_membership_active_relation_idx" ON "circle_membership_periods" USING btree ("relation_id") WHERE "circle_membership_periods"."left_at" is null;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assert_circle_active_period_consistency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "circle_member_relations" AS relation
		JOIN "circle_membership_periods" AS period
			ON period."id" = relation."active_period_id"
		WHERE relation."active_period_id" IS NOT NULL
			AND (
				period."relation_id" <> relation."id"
				OR period."left_at" IS NOT NULL
			)
	) THEN
		RAISE EXCEPTION 'active circle membership period must be open and belong to the same relation';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM "circle_membership_periods" AS period
		JOIN "circle_member_relations" AS relation
			ON relation."id" = period."relation_id"
		WHERE period."left_at" IS NULL
			AND relation."active_period_id" IS DISTINCT FROM period."id"
	) THEN
		RAISE EXCEPTION 'every open circle membership period must be the active period of its relation';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "circle_member_relations_active_period_consistency"
AFTER INSERT OR UPDATE OF "active_period_id" ON "circle_member_relations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_circle_active_period_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "circle_membership_periods_active_pointer_consistency"
AFTER INSERT OR UPDATE OF "left_at", "relation_id" ON "circle_membership_periods"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_circle_active_period_consistency"();
