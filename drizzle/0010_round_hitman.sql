CREATE TABLE `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`reference` text NOT NULL,
	`account_id` text NOT NULL,
	`account_code` text NOT NULL,
	`order_revision` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`matched_at` integer,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intents_reference_unique` ON `payment_intents` (`reference`);--> statement-breakpoint
CREATE INDEX `payment_intents_order_idx` ON `payment_intents` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_intents_status_idx` ON `payment_intents` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`intent_id`) REFERENCES `payment_intents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_receipts_intent_idx` ON `payment_receipts` (`intent_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `messages` ADD `encrypted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order_access` ADD `received_at` integer;--> statement-breakpoint
ALTER TABLE `order_access` ADD `received_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `support_messages` ADD `encrypted` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE order_access SET received_at = created_at WHERE order_id IN (SELECT id FROM orders WHERE started_at IS NOT NULL);
