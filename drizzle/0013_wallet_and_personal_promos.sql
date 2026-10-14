CREATE TABLE `personal_promos` (
	`user_id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_promos_code_unique` ON `personal_promos` (`code`);--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wallet_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reference` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`order_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_entries_reference_unique` ON `wallet_entries` (`reference`);--> statement-breakpoint
CREATE INDEX `wallet_entries_user_idx` ON `wallet_entries` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `wallet_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`topup_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`topup_id`) REFERENCES `wallet_topups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_receipts_topup_idx` ON `wallet_receipts` (`topup_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_topups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reference` text NOT NULL,
	`account_id` text NOT NULL,
	`account_code` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_topups_reference_unique` ON `wallet_topups` (`reference`);--> statement-breakpoint
CREATE INDEX `wallet_topups_user_idx` ON `wallet_topups` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_owner_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_discount_percent` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `promo_commission_percent` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `promo_earnings` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `promo_earnings` ADD `credited_at` integer;--> statement-breakpoint
CREATE INDEX `promo_earnings_owner_idx` ON `promo_earnings` (`owner_id`,`created_at`);