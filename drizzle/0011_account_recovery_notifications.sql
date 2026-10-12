CREATE TABLE `chat_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`sent_at` integer,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_outbox_pending_idx` ON `mail_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `mail_outbox_expiry_idx` ON `mail_outbox` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mail_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'ru' NOT NULL,
	`order_updates` integer DEFAULT true NOT NULL,
	`chat_reminders` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `password_resets_user_idx` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE INDEX `password_resets_expiry_idx` ON `password_resets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `service_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
