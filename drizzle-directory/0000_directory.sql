CREATE TABLE `dealers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`binding` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dealers_binding_unique` ON `dealers` (`binding`);--> statement-breakpoint
CREATE TABLE `members` (
	`dealer_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`dealer_id`, `email`),
	FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_email_idx` ON `members` (`email`);