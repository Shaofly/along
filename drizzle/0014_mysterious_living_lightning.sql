ALTER TABLE "media_assets" ADD COLUMN "content_committed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "media_assets" AS "asset"
SET "content_committed_at" = GREATEST(
	"asset"."created_at",
	COALESCE(
		(
			SELECT min("post"."created_at")
			FROM "post_media" AS "link"
			JOIN "posts" AS "post" ON "post"."id" = "link"."post_id"
			WHERE "link"."media_id" = "asset"."id"
		),
		(
			SELECT min("snapshot_post"."captured_at")
			FROM "circle_exit_snapshot_media" AS "archive_link"
			JOIN "circle_exit_snapshot_posts" AS "snapshot_post"
				ON "snapshot_post"."id" = "archive_link"."snapshot_post_id"
			WHERE "archive_link"."media_id" = "asset"."id"
		),
		"asset"."created_at"
	)
)
WHERE EXISTS (
	SELECT 1
	FROM "post_media" AS "link"
	WHERE "link"."media_id" = "asset"."id"
)
OR EXISTS (
	SELECT 1
	FROM "circle_exit_snapshot_media" AS "archive_link"
	WHERE "archive_link"."media_id" = "asset"."id"
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "protect_media_content_commitment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."content_committed_at" IS NOT NULL
		AND NEW."content_committed_at" < NEW."created_at"
	THEN
		RAISE EXCEPTION 'media content commitment cannot predate asset creation';
	END IF;
	IF OLD."content_committed_at" IS NOT NULL
		AND NEW."content_committed_at" IS DISTINCT FROM OLD."content_committed_at"
	THEN
		RAISE EXCEPTION 'media content commitment is immutable';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "media_assets_content_commitment_immutable"
BEFORE UPDATE OF "content_committed_at"
ON "media_assets"
FOR EACH ROW
EXECUTE FUNCTION "protect_media_content_commitment"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "mark_media_content_committed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "media_assets"
	SET "content_committed_at" = GREATEST("created_at", CURRENT_TIMESTAMP)
	WHERE "id" = NEW."media_id"
		AND "content_committed_at" IS NULL;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "post_media_marks_content_committed"
AFTER INSERT OR UPDATE OF "media_id"
ON "post_media"
FOR EACH ROW
EXECUTE FUNCTION "mark_media_content_committed"();--> statement-breakpoint
CREATE TRIGGER "archive_media_marks_content_committed"
AFTER INSERT OR UPDATE OF "media_id"
ON "circle_exit_snapshot_media"
FOR EACH ROW
EXECUTE FUNCTION "mark_media_content_committed"();
