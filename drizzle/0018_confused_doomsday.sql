ALTER TABLE "user_profile_appearance" ADD COLUMN "avatar_scale" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile_appearance" ADD COLUMN "cover_scale" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile_appearance" ADD CONSTRAINT "user_profile_appearance_scale_range" CHECK ("user_profile_appearance"."avatar_scale" between 10000 and 100000
        and "user_profile_appearance"."cover_scale" between 10000 and 100000);