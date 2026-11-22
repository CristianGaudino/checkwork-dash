CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`public_key` blob NOT NULL,
	`alg` integer NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`backup_eligible` integer NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `passkeys_staff_idx` ON `passkeys` (`staff_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`method` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_staff_idx` ON `sessions` (`staff_id`);--> statement-breakpoint
CREATE TABLE `sign_in_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`email` text,
	`staff_id` text,
	`challenge` text,
	`code_hmac` text,
	`token_hmac` text,
	`browser_hash` text,
	`tries` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sign_in_attempts_token_hmac_unique` ON `sign_in_attempts` (`token_hmac`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_failures` integer DEFAULT 0 NOT NULL,
	`code_locked_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_email_unique` ON `staff` (`email`);