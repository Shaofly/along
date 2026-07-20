CREATE TYPE "public"."profile_theme" AS ENUM('sage', 'rose', 'mist', 'apricot', 'ink');--> statement-breakpoint
CREATE TABLE "user_profile_appearance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"avatar_media_id" text,
	"cover_media_id" text,
	"theme" "profile_theme" DEFAULT 'sage' NOT NULL,
	"avatar_focus_x" integer DEFAULT 5000 NOT NULL,
	"avatar_focus_y" integer DEFAULT 5000 NOT NULL,
	"cover_focus_x" integer DEFAULT 5000 NOT NULL,
	"cover_focus_y" integer DEFAULT 5000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_appearance_avatar_focus_range" CHECK ("user_profile_appearance"."avatar_focus_x" between 0 and 10000
        and "user_profile_appearance"."avatar_focus_y" between 0 and 10000),
	CONSTRAINT "user_profile_appearance_cover_focus_range" CHECK ("user_profile_appearance"."cover_focus_x" between 0 and 10000
        and "user_profile_appearance"."cover_focus_y" between 0 and 10000),
	CONSTRAINT "user_profile_appearance_distinct_media" CHECK ("user_profile_appearance"."avatar_media_id" is null
        or "user_profile_appearance"."cover_media_id" is null
        or "user_profile_appearance"."avatar_media_id" <> "user_profile_appearance"."cover_media_id")
);
--> statement-breakpoint
ALTER TABLE "user_profile_appearance" ADD CONSTRAINT "user_profile_appearance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_appearance" ADD CONSTRAINT "user_profile_appearance_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_appearance" ADD CONSTRAINT "user_profile_appearance_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_appearance_avatar_media_idx" ON "user_profile_appearance" USING btree ("avatar_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_appearance_cover_media_idx" ON "user_profile_appearance" USING btree ("cover_media_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "mark_profile_media_committed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "media_assets"
	SET "content_committed_at" = GREATEST("created_at", CURRENT_TIMESTAMP)
	WHERE "id" IN (NEW."avatar_media_id", NEW."cover_media_id")
		AND "content_committed_at" IS NULL;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "profile_media_marks_content_committed"
AFTER INSERT OR UPDATE OF "avatar_media_id", "cover_media_id"
ON "user_profile_appearance"
FOR EACH ROW
EXECUTE FUNCTION "mark_profile_media_committed"();
