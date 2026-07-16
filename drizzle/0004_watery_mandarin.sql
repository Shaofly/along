DROP INDEX "post_media_media_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_media_idx" ON "post_media" USING btree ("media_id");