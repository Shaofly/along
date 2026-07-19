CREATE TABLE "draft_participants" (
	"draft_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "draft_participants_draft_id_user_id_pk" PRIMARY KEY("draft_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "draft_participants" ADD CONSTRAINT "draft_participants_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_participants" ADD CONSTRAINT "draft_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "draft_participants" ("draft_id", "user_id")
SELECT "id", "author_id"
FROM "drafts"
WHERE "circle_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE INDEX "draft_participants_user_idx" ON "draft_participants" USING btree ("user_id","draft_id");--> statement-breakpoint
CREATE INDEX "drafts_author_circle_updated_idx" ON "drafts" USING btree ("author_id","circle_id","updated_at");
