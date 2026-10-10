CREATE TABLE `donation_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text,
	`account_id` text,
	`code` text,
	`name` text,
	`state_hash` text,
	`state_actor` text,
	`state_expires_at` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`state_actor`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `donation_test_events` (
	`id` text PRIMARY KEY NOT NULL,
	`test_id` text NOT NULL,
	`source` text NOT NULL,
	`result` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`test_id`) REFERENCES `donation_tests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `donation_test_events_test_idx` ON `donation_test_events` (`test_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `donation_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`actor_id` text NOT NULL,
	`order_id` text,
	`order_revision` integer,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`matched_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donation_tests_reference_unique` ON `donation_tests` (`reference`);--> statement-breakpoint
CREATE INDEX `donation_tests_created_idx` ON `donation_tests` (`created_at`);