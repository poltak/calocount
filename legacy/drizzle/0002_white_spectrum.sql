CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_hash_idx` ON `share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `share_links_owner_created_idx` ON `share_links` (`owner_key`,`created_at`);