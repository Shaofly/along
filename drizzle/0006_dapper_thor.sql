CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_proposals_active_candidate_idx" ON "circle_join_proposals" USING btree ("circle_id","candidate_id") WHERE "circle_join_proposals"."status" in ('pending_approval', 'awaiting_candidate');--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_idx" ON "user" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_timestamps_ordered" CHECK ("account"."updated_at" >= "account"."created_at");--> statement-breakpoint
ALTER TABLE "circle_events" ADD CONSTRAINT "circle_events_type_not_blank" CHECK (btrim("circle_events"."type") <> '');--> statement-breakpoint
ALTER TABLE "circle_events" ADD CONSTRAINT "circle_events_message_not_blank" CHECK (btrim("circle_events"."message") <> '');--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_proposals_expiry_after_creation" CHECK ("circle_join_proposals"."expires_at" > "circle_join_proposals"."created_at");--> statement-breakpoint
ALTER TABLE "circle_join_proposals" ADD CONSTRAINT "circle_proposals_resolution_consistent" CHECK (("circle_join_proposals"."status" in ('pending_approval', 'awaiting_candidate') and "circle_join_proposals"."resolved_at" is null)
        or ("circle_join_proposals"."status" in ('accepted', 'declined', 'expired') and "circle_join_proposals"."resolved_at" is not null));--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_period_ordered" CHECK ("circle_membership_periods"."left_at" is null or "circle_membership_periods"."left_at" >= "circle_membership_periods"."joined_at");--> statement-breakpoint
ALTER TABLE "circle_membership_periods" ADD CONSTRAINT "circle_membership_visibility_ordered" CHECK ("circle_membership_periods"."visible_from" is null or "circle_membership_periods"."visible_from" <= "circle_membership_periods"."joined_at");--> statement-breakpoint
ALTER TABLE "circle_post_snapshots" ADD CONSTRAINT "circle_snapshots_capture_ordered" CHECK ("circle_post_snapshots"."captured_at" >= "circle_post_snapshots"."updated_at");--> statement-breakpoint
ALTER TABLE "circle_proposal_approvals" ADD CONSTRAINT "circle_approvals_response_consistent" CHECK (("circle_proposal_approvals"."decision" = 'pending' and "circle_proposal_approvals"."responded_at" is null)
        or ("circle_proposal_approvals"."decision" <> 'pending' and "circle_proposal_approvals"."responded_at" is not null));--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_name_not_blank" CHECK (btrim("circles"."name") <> '');--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_name_length" CHECK (char_length("circles"."name") <= 80);--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_description_length" CHECK (char_length("circles"."description") <= 500);--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_timestamps_ordered" CHECK ("circles"."updated_at" >= "circles"."created_at");--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_dissolution_consistent" CHECK (("circles"."status" = 'dissolved' and "circles"."dissolved_at" is not null)
        or ("circles"."status" <> 'dissolved' and "circles"."dissolved_at" is null));--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_distinct_users" CHECK ("friendships"."user_one_id" <> "friendships"."user_two_id");--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_canonical_order" CHECK ("friendships"."user_one_id" < "friendships"."user_two_id");--> statement-breakpoint
ALTER TABLE "invitation_sponsors" ADD CONSTRAINT "invitation_sponsors_response_consistent" CHECK (("invitation_sponsors"."status" = 'pending' and "invitation_sponsors"."responded_at" is null)
        or ("invitation_sponsors"."status" <> 'pending' and "invitation_sponsors"."responded_at" is not null));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sponsor_count_range" CHECK ("invitations"."required_sponsor_count" between 2 and 5);--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_normalized" CHECK ("invitations"."invited_email" = lower(btrim("invitations"."invited_email")));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_expiry_after_creation" CHECK ("invitations"."expires_at" > "invitations"."created_at");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_usage_consistent" CHECK (("invitations"."status" = 'used' and "invitations"."used_by_id" is not null and "invitations"."used_at" is not null)
        or ("invitations"."status" <> 'used' and "invitations"."used_by_id" is null and "invitations"."used_at" is null));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_positive_size" CHECK ("media_assets"."byte_size" > 0);--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_position_range" CHECK ("post_media"."position" between 0 and 19);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_body_length" CHECK (char_length("posts"."body") <= 5000);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_timestamps_ordered" CHECK ("posts"."updated_at" >= "posts"."created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_personal_management_mode" CHECK ("posts"."circle_id" is not null or "posts"."management_mode" = 'creator');--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_circle_visibility" CHECK ("posts"."circle_id" is null or "posts"."visibility" = 'private');--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_expiry_after_creation" CHECK ("session"."expires_at" > "session"."created_at");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_timestamps_ordered" CHECK ("session"."updated_at" >= "session"."created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_name_not_blank" CHECK (btrim("user"."name") <> '');--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_normalized" CHECK ("user"."email" = lower(btrim("user"."email")));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_timestamps_ordered" CHECK ("user"."updated_at" >= "user"."created_at");--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_expiry_after_creation" CHECK ("verification"."expires_at" > "verification"."created_at");--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_timestamps_ordered" CHECK ("verification"."updated_at" >= "verification"."created_at");