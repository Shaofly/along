CREATE TYPE "public"."profile_info_visibility" AS ENUM('all', 'selected', 'private');--> statement-breakpoint
CREATE TABLE "user_profile_detail_viewers" (
	"owner_id" text NOT NULL,
	"viewer_id" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_detail_viewers_owner_id_viewer_id_pk" PRIMARY KEY("owner_id","viewer_id"),
	CONSTRAINT "user_profile_detail_viewers_distinct_users" CHECK ("user_profile_detail_viewers"."owner_id" <> "user_profile_detail_viewers"."viewer_id")
);
--> statement-breakpoint
CREATE TABLE "user_profile_details" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gender" text,
	"residence" text,
	"phone" text,
	"contact_email" text,
	"school" text,
	"visibility" "profile_info_visibility" DEFAULT 'private' NOT NULL,
	"last_shared_visibility" "profile_info_visibility",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_details_gender_length" CHECK ("user_profile_details"."gender" is null or char_length("user_profile_details"."gender") <= 32),
	CONSTRAINT "user_profile_details_residence_length" CHECK ("user_profile_details"."residence" is null or char_length("user_profile_details"."residence") <= 80),
	CONSTRAINT "user_profile_details_phone_length" CHECK ("user_profile_details"."phone" is null or char_length("user_profile_details"."phone") <= 40),
	CONSTRAINT "user_profile_details_contact_email_length" CHECK ("user_profile_details"."contact_email" is null or char_length("user_profile_details"."contact_email") <= 254),
	CONSTRAINT "user_profile_details_contact_email_normalized" CHECK ("user_profile_details"."contact_email" is null
        or "user_profile_details"."contact_email" = lower(btrim("user_profile_details"."contact_email"))),
	CONSTRAINT "user_profile_details_school_length" CHECK ("user_profile_details"."school" is null or char_length("user_profile_details"."school") <= 100),
	CONSTRAINT "user_profile_details_last_shared_visibility" CHECK ("user_profile_details"."last_shared_visibility" is null
        or "user_profile_details"."last_shared_visibility" in ('all', 'selected'))
);
--> statement-breakpoint
ALTER TABLE "user_profile_detail_viewers" ADD CONSTRAINT "user_profile_detail_viewers_owner_id_user_profile_details_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profile_details"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_detail_viewers" ADD CONSTRAINT "user_profile_detail_viewers_viewer_id_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_details" ADD CONSTRAINT "user_profile_details_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_profile_detail_viewers_viewer_idx" ON "user_profile_detail_viewers" USING btree ("viewer_id");