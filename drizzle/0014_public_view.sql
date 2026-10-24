ALTER TABLE `settings` ADD `public_view_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Each existing owner already shows the public view, so keep it on. A new owner starts with it off.
UPDATE `settings` SET `public_view_enabled` = true;
