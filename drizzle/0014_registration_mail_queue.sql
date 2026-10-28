PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
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
INSERT INTO `__new_mail_outbox`("id", "user_id", "recipient", "kind", "parent_id", "payload", "status", "attempts", "next_attempt_at", "lease_until", "created_at", "expires_at", "sent_at", "last_error") SELECT "id", "user_id", "recipient", "kind", "parent_id", "payload", "status", "attempts", "next_attempt_at", "lease_until", "created_at", "expires_at", "sent_at", "last_error" FROM `mail_outbox`;--> statement-breakpoint
DROP TABLE `mail_outbox`;--> statement-breakpoint
ALTER TABLE `__new_mail_outbox` RENAME TO `mail_outbox`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `mail_outbox_pending_idx` ON `mail_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `mail_outbox_expiry_idx` ON `mail_outbox` (`expires_at`);