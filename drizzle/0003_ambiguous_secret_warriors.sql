ALTER TABLE `sessions` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `auth_attempts_window_idx` ON `auth_attempts` (`window_start`);--> statement-breakpoint
CREATE INDEX `messages_order_created_idx` ON `messages` (`order_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_user_created_idx` ON `orders` (`user_id`,`created_at`);