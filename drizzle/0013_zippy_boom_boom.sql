CREATE TYPE "public"."circle_creation_invite_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."circle_creation_status" AS ENUM('pending', 'formed', 'failed');--> statement-breakpoint
CREATE TABLE "circle_creation_invitees" (
	"request_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"status" "circle_creation_invite_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "circle_creation_invitees_request_id_candidate_id_pk" PRIMARY KEY("request_id","candidate_id"),
	CONSTRAINT "circle_creation_invitees_resolution_consistent" CHECK (("circle_creation_invitees"."status" = 'pending' and "circle_creation_invitees"."resolved_at" is null)
        or ("circle_creation_invitees"."status" <> 'pending' and "circle_creation_invitees"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "circle_creation_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "circle_creation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"formed_circle_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"purge_at" timestamp with time zone,
	CONSTRAINT "circle_creation_requests_name_not_blank" CHECK (btrim("circle_creation_requests"."name") <> ''),
	CONSTRAINT "circle_creation_requests_name_length" CHECK (char_length("circle_creation_requests"."name") <= 80),
	CONSTRAINT "circle_creation_requests_description_length" CHECK (char_length("circle_creation_requests"."description") <= 500),
	CONSTRAINT "circle_creation_requests_expiry_after_creation" CHECK ("circle_creation_requests"."expires_at" > "circle_creation_requests"."created_at"),
	CONSTRAINT "circle_creation_requests_resolution_consistent" CHECK (("circle_creation_requests"."status" = 'pending'
          and "circle_creation_requests"."resolved_at" is null
          and "circle_creation_requests"."formed_circle_id" is null
          and "circle_creation_requests"."purge_at" is null)
        or ("circle_creation_requests"."status" = 'formed'
          and "circle_creation_requests"."resolved_at" is not null
          and "circle_creation_requests"."formed_circle_id" is not null
          and "circle_creation_requests"."purge_at" is null)
        or ("circle_creation_requests"."status" = 'failed'
          and "circle_creation_requests"."resolved_at" is not null
          and "circle_creation_requests"."formed_circle_id" is null
          and "circle_creation_requests"."purge_at" is not null
          and "circle_creation_requests"."purge_at" > "circle_creation_requests"."resolved_at"))
);
--> statement-breakpoint
ALTER TABLE "circle_join_proposals" DROP CONSTRAINT "circle_proposals_resolution_consistent";--> statement-breakpoint
DROP INDEX "circle_proposals_active_candidate_idx";--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."circle_proposal_status";--> statement-breakpoint
CREATE TYPE "public"."circle_proposal_status" AS ENUM('pending_approval', 'awaiting_candidate', 'accepted', 'declined', 'expired', 'invalidated');--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ALTER COLUMN "status" SET DATA TYPE "public"."circle_proposal_status" USING "status"::"public"."circle_proposal_status";--> statement-breakpoint
DELETE FROM "drafts"
WHERE "circle_id" IN (
	SELECT "id" FROM "circles" WHERE "status" = 'forming'
);--> statement-breakpoint
DELETE FROM "posts"
WHERE "circle_id" IN (
	SELECT "id" FROM "circles" WHERE "status" = 'forming'
);--> statement-breakpoint
DELETE FROM "circles" WHERE "status" = 'forming';--> statement-breakpoint
DELETE FROM "circle_join_proposals" WHERE "kind" = 'initial';--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."circle_proposal_kind";--> statement-breakpoint
CREATE TYPE "public"."circle_proposal_kind" AS ENUM('add', 'rejoin');--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ALTER COLUMN "kind" SET DATA TYPE "public"."circle_proposal_kind" USING "kind"::"public"."circle_proposal_kind";--> statement-breakpoint
ALTER TABLE "circles" DROP CONSTRAINT "circles_dissolution_consistent";--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."circle_status";--> statement-breakpoint
CREATE TYPE "public"."circle_status" AS ENUM('active', 'frozen', 'dissolved');--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "status" SET DATA TYPE "public"."circle_status" USING "status"::"public"."circle_status";--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."circle_status";--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD COLUMN "active_slot" integer;--> statement-breakpoint
WITH "ranked_active_relations" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "circle_id"
			ORDER BY "created_at", "id"
		) AS "slot"
	FROM "circle_member_relations"
	WHERE "active_period_id" IS NOT NULL
)
UPDATE "circle_member_relations" AS "relation"
SET "active_slot" = "ranked"."slot"
FROM "ranked_active_relations" AS "ranked"
WHERE "relation"."id" = "ranked"."id";--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "delete_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "recoverable_by_user_id" text;--> statement-breakpoint
ALTER TABLE "circle_creation_invitees" ADD CONSTRAINT "circle_creation_invitees_request_id_circle_creation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."circle_creation_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_creation_invitees" ADD CONSTRAINT "circle_creation_invitees_candidate_id_user_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_creation_requests" ADD CONSTRAINT "circle_creation_requests_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_creation_requests" ADD CONSTRAINT "circle_creation_requests_formed_circle_id_circles_id_fk" FOREIGN KEY ("formed_circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_creation_invitees_candidate_status_idx" ON "circle_creation_invitees" USING btree ("candidate_id","status");--> statement-breakpoint
CREATE INDEX "circle_creation_requests_creator_status_idx" ON "circle_creation_requests" USING btree ("creator_id","status");--> statement-breakpoint
CREATE INDEX "circle_creation_requests_expiry_idx" ON "circle_creation_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "circle_creation_requests_purge_idx" ON "circle_creation_requests" USING btree ("status","purge_at");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_creation_requests_formed_circle_idx" ON "circle_creation_requests" USING btree ("formed_circle_id") WHERE "circle_creation_requests"."formed_circle_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_proposals_active_candidate_idx" ON "circle_join_proposals" USING btree ("circle_id","candidate_id") WHERE "circle_join_proposals"."status" in ('pending_approval', 'awaiting_candidate');--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_recoverable_by_user_id_user_id_fk" FOREIGN KEY ("recoverable_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_member_relations_circle_slot_idx" ON "circle_member_relations" USING btree ("circle_id","active_slot") WHERE "circle_member_relations"."active_slot" is not null;--> statement-breakpoint
CREATE INDEX "circles_frozen_delete_idx" ON "circles" USING btree ("status","delete_at");--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_proposals_resolution_consistent" CHECK (("circle_join_proposals"."status" in ('pending_approval', 'awaiting_candidate') and "circle_join_proposals"."resolved_at" is null)
        or ("circle_join_proposals"."status" in ('accepted', 'declined', 'expired', 'invalidated') and "circle_join_proposals"."resolved_at" is not null));--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD CONSTRAINT "circle_member_relations_active_slot_range" CHECK ("circle_member_relations"."active_slot" is null or "circle_member_relations"."active_slot" between 1 and 10);--> statement-breakpoint
ALTER TABLE "circle_member_relations" ADD CONSTRAINT "circle_member_relations_active_slot_consistent" CHECK (("circle_member_relations"."active_period_id" is null and "circle_member_relations"."active_slot" is null)
        or ("circle_member_relations"."active_period_id" is not null and "circle_member_relations"."active_slot" is not null));--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_dissolution_consistent" CHECK (("circles"."status" = 'dissolved' and "circles"."dissolved_at" is not null)
        or ("circles"."status" <> 'dissolved' and "circles"."dissolved_at" is null));--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_freeze_consistent" CHECK (("circles"."status" = 'frozen'
          and "circles"."frozen_at" is not null
          and "circles"."delete_at" is not null
          and "circles"."delete_at" > "circles"."frozen_at"
          and "circles"."recoverable_by_user_id" is not null)
        or ("circles"."status" <> 'frozen'
          and "circles"."frozen_at" is null
          and "circles"."delete_at" is null
          and "circles"."recoverable_by_user_id" is null));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assert_circle_lifecycle_consistency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "circles" AS "circle"
		WHERE "circle"."status" = 'active'
			AND NOT EXISTS (
				SELECT 1
				FROM "circle_member_relations" AS "relation"
				WHERE "relation"."circle_id" = "circle"."id"
					AND "relation"."active_period_id" IS NOT NULL
					AND "relation"."active_slot" IS NOT NULL
			)
	) THEN
		RAISE EXCEPTION 'active circle must have at least one active member';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM "circle_member_relations" AS "relation"
		JOIN "circles" AS "circle" ON "circle"."id" = "relation"."circle_id"
		WHERE "relation"."active_period_id" IS NOT NULL
			AND (
				"relation"."active_slot" IS NULL
				OR "circle"."status" <> 'active'
			)
	) THEN
		RAISE EXCEPTION 'only active circles may have active members';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "circles_lifecycle_consistency"
AFTER INSERT OR UPDATE OF "status", "frozen_at", "delete_at", "recoverable_by_user_id"
ON "circles"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_circle_lifecycle_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "circle_member_relations_lifecycle_consistency"
AFTER INSERT OR UPDATE OF "active_period_id", "active_slot" OR DELETE
ON "circle_member_relations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "assert_circle_lifecycle_consistency"();
