CREATE TABLE "draft_media" (
	"draft_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "draft_media_draft_id_media_id_pk" PRIMARY KEY("draft_id","media_id"),
	CONSTRAINT "draft_media_position_range" CHECK ("draft_media"."position" between 0 and 19)
);
--> statement-breakpoint
CREATE TABLE "draft_viewers" (
	"draft_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "draft_viewers_draft_id_user_id_pk" PRIMARY KEY("draft_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"circle_id" text,
	"body" text DEFAULT '' NOT NULL,
	"visibility" "post_visibility" DEFAULT 'friends' NOT NULL,
	"management_mode" "circle_management_mode" DEFAULT 'creator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_body_length" CHECK (char_length("drafts"."body") <= 5000),
	CONSTRAINT "drafts_timestamps_ordered" CHECK ("drafts"."updated_at" >= "drafts"."created_at"),
	CONSTRAINT "drafts_personal_management_mode" CHECK ("drafts"."circle_id" is not null or "drafts"."management_mode" = 'creator'),
	CONSTRAINT "drafts_circle_visibility" CHECK ("drafts"."circle_id" is null or "drafts"."visibility" = 'private')
);
--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_viewers" ADD CONSTRAINT "draft_viewers_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_viewers" ADD CONSTRAINT "draft_viewers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_media_position_idx" ON "draft_media" USING btree ("draft_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_media_media_idx" ON "draft_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "draft_viewers_user_idx" ON "draft_viewers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drafts_author_updated_idx" ON "drafts" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "drafts_circle_idx" ON "drafts" USING btree ("circle_id");