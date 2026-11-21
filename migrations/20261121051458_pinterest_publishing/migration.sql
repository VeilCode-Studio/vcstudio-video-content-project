ALTER TYPE "content_platform" ADD VALUE 'pinterest' BEFORE 'youtube';--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD COLUMN "pinterest_settings" jsonb;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "pinterest_settings" jsonb;