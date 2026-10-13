CREATE TABLE `order_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`rating` integer NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_reviews_order_id_unique` ON `order_reviews` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_reviews_public_idx` ON `order_reviews` (`published`,`created_at`);