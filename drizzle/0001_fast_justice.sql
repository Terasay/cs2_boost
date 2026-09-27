CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
