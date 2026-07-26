CREATE INDEX `idx_accounts_user` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_comments_post` ON `comments` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_likes_post` ON `likes` (`post_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_likes_user_post` ON `likes` (`user_id`,`post_id`);--> statement-breakpoint
CREATE INDEX `idx_pe_user` ON `point_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_pe_user_date_source` ON `point_events` (`user_id`,`event_date`,`source`);--> statement-breakpoint
CREATE INDEX `idx_pe_source_date` ON `point_events` (`source`,`event_date`);--> statement-breakpoint
CREATE INDEX `idx_posts_created_id` ON `posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_posts_user_created` ON `posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
-- Estatisticas para o planner escolher os indices novos (drizzle-kit nao gera ANALYZE).
ANALYZE;