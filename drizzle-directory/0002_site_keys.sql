CREATE TABLE `site_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`dealer_id` text NOT NULL,
	`hash` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_keys_hash_unique` ON `site_keys` (`hash`);--> statement-breakpoint
CREATE INDEX `site_keys_dealer_idx` ON `site_keys` (`dealer_id`);