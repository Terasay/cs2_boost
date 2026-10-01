CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`draft` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_verifications_email_idx` ON `email_verifications` (`email`);--> statement-breakpoint
CREATE INDEX `email_verifications_expiry_idx` ON `email_verifications` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;