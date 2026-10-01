CREATE INDEX `orders_created_idx` ON `orders` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `support_threads_updated_idx` ON `support_threads` (`updated_at`,`id`);