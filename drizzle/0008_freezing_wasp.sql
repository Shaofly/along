CREATE TABLE "friend_remarks" (
	"owner_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"remark" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_remarks_owner_id_friend_id_pk" PRIMARY KEY("owner_id","friend_id"),
	CONSTRAINT "friend_remarks_distinct_users" CHECK ("friend_remarks"."owner_id" <> "friend_remarks"."friend_id"),
	CONSTRAINT "friend_remarks_not_blank" CHECK (btrim("friend_remarks"."remark") <> ''),
	CONSTRAINT "friend_remarks_length" CHECK (char_length("friend_remarks"."remark") <= 40)
);
--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD COLUMN "circle_nickname" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "real_name" text;--> statement-breakpoint
UPDATE "user" SET "real_name" = "name" WHERE "real_name" IS NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "real_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "friend_remarks" ADD CONSTRAINT "friend_remarks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_remarks" ADD CONSTRAINT "friend_remarks_friend_id_user_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_remarks_friend_idx" ON "friend_remarks" USING btree ("friend_id");--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_nickname_not_blank" CHECK ("circle_membership_periods"."circle_nickname" is null or btrim("circle_membership_periods"."circle_nickname") <> '');--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_nickname_length" CHECK ("circle_membership_periods"."circle_nickname" is null or char_length("circle_membership_periods"."circle_nickname") <= 40);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_real_name_not_blank" CHECK (btrim("user"."real_name") <> '');--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_nickname_not_blank" CHECK ("user"."nickname" is null or btrim("user"."nickname") <> '');
