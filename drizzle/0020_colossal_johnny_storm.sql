CREATE TYPE "public"."circle_theme" AS ENUM('peach', 'sage', 'mist', 'lavender', 'apricot', 'teal');--> statement-breakpoint
ALTER TABLE "circle_creation_requests" ADD COLUMN "theme" "circle_theme" DEFAULT 'peach' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "theme" "circle_theme" DEFAULT 'peach' NOT NULL;