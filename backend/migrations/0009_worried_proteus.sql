CREATE TABLE `saved_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`source_meal_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_entries_owner_source_idx` ON `saved_entries` (`owner_key`,`source_meal_id`);--> statement-breakpoint
CREATE INDEX `saved_entries_owner_created_idx` ON `saved_entries` (`owner_key`,`created_at`);