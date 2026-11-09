CREATE TABLE `daily_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`logical_date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_weights_owner_date_idx` ON `daily_weights` (`owner_key`,`logical_date`);