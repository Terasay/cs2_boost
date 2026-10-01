CREATE TABLE `order_access` (
	`order_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_access_expiry_idx` ON `order_access` (`expires_at`);--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `promo_earnings` (
	`order_id` text PRIMARY KEY NOT NULL,
	`promo_code` text NOT NULL,
	`paid_amount` integer NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reversed_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `promo_earnings_code_idx` ON `promo_earnings` (`promo_code`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `pricing_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `red_trust` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `base_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `surcharge_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `total_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `initial_total_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `commission_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `duration_days` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `standard_days` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `accepted_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `proposal_amount` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `proposal_days` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `proposal_reason` text;--> statement-breakpoint
UPDATE orders SET total_amount = quoted_price * 100, initial_total_amount = quoted_price * 100 WHERE quoted_price IS NOT NULL;
--> statement-breakpoint
UPDATE orders SET duration_days = max(1, (target_rating - current_rating + CASE WHEN platform = 'premier' THEN 999 ELSE 99 END) / CASE WHEN platform = 'premier' THEN 1000 ELSE 100 END), standard_days = max(1, (target_rating - current_rating + CASE WHEN platform = 'premier' THEN 999 ELSE 99 END) / CASE WHEN platform = 'premier' THEN 1000 ELSE 100 END) WHERE service = 'rating' AND target_rating > current_rating;
