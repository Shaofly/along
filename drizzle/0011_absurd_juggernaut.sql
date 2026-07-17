CREATE TYPE "public"."media_job_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('uploaded', 'processing', 'ready', 'failed', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."media_upload_status" AS ENUM('issued', 'uploading', 'uploaded', 'verified', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_variant_type" AS ENUM('thumbnail', 'preview', 'hd');--> statement-breakpoint
CREATE TYPE "public"."post_publication_status" AS ENUM('publishing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "media_processing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"upload_session_id" text,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"status" "media_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "media_processing_jobs_attempts_nonnegative" CHECK ("media_processing_jobs"."attempts" >= 0),
	CONSTRAINT "media_processing_jobs_completion_consistent" CHECK ("media_processing_jobs"."status" not in ('completed', 'failed') or "media_processing_jobs"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"incoming_key" text NOT NULL,
	"status" "media_upload_status" DEFAULT 'issued' NOT NULL,
	"expected_mime_type" text NOT NULL,
	"expected_byte_size" bigint NOT NULL,
	"object_etag" text,
	"error_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "media_upload_sessions_incoming_key_unique" UNIQUE("incoming_key"),
	CONSTRAINT "media_upload_sessions_positive_size" CHECK ("media_upload_sessions"."expected_byte_size" > 0),
	CONSTRAINT "media_upload_sessions_completion_consistent" CHECK ("media_upload_sessions"."status" not in ('verified', 'failed', 'expired')
        or "media_upload_sessions"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"media_id" text NOT NULL,
	"variant_type" "media_variant_type" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_variants_media_id_variant_type_pk" PRIMARY KEY("media_id","variant_type"),
	CONSTRAINT "media_variants_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_variants_positive_size" CHECK ("media_variants"."byte_size" > 0),
	CONSTRAINT "media_variants_positive_dimensions" CHECK ("media_variants"."width" > 0 and "media_variants"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "status" "media_status" DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source_mime_type" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source_byte_size" bigint;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source_width" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source_height" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "ready_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "publication_status" "post_publication_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "posts" SET "published_at" = "created_at";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "publication_error" text;--> statement-breakpoint
ALTER TABLE "media_processing_jobs" ADD CONSTRAINT "media_processing_jobs_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_processing_jobs" ADD CONSTRAINT "media_processing_jobs_upload_session_id_media_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."media_upload_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_processing_jobs_media_created_idx" ON "media_processing_jobs" USING btree ("media_id","created_at");--> statement-breakpoint
CREATE INDEX "media_processing_jobs_status_idx" ON "media_processing_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "media_upload_sessions_owner_status_idx" ON "media_upload_sessions" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "media_upload_sessions_expiry_idx" ON "media_upload_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "media_variants_media_idx" ON "media_variants" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_assets_owner_status_idx" ON "media_assets" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "posts_publication_created_idx" ON "posts" USING btree ("publication_status","created_at");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_size_positive" CHECK ("media_assets"."source_byte_size" is null or "media_assets"."source_byte_size" > 0);--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_dimensions_positive" CHECK (("media_assets"."source_width" is null and "media_assets"."source_height" is null)
        or ("media_assets"."source_width" > 0 and "media_assets"."source_height" > 0));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ready_consistent" CHECK ("media_assets"."status" <> 'ready' or "media_assets"."ready_at" is not null);--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_failure_consistent" CHECK ("media_assets"."status" = 'failed' or "media_assets"."failure_code" is null);--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_timestamps_ordered" CHECK ("media_assets"."updated_at" >= "media_assets"."created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_publication_error_consistent" CHECK ("posts"."publication_status" = 'failed' or "posts"."publication_error" is null);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_published_at_consistent" CHECK ("posts"."publication_status" <> 'published' or "posts"."published_at" is not null);
