CREATE TABLE `goal_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`changed_at` integer NOT NULL,
	`daily_calorie_target` integer,
	`protein_goal_mode` text DEFAULT 'grams' NOT NULL,
	`daily_protein_target_g` real,
	`daily_protein_target_per_kg` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goal_changes_owner_changed_idx` ON `goal_changes` (`owner_key`,`changed_at`);--> statement-breakpoint
-- Start each owner's history with the goals saved now. They have not changed since the settings were last saved.
INSERT INTO `goal_changes` (`id`, `owner_key`, `changed_at`, `daily_calorie_target`, `protein_goal_mode`, `daily_protein_target_g`, `daily_protein_target_per_kg`)
SELECT 'goal_baseline_' || `owner_key`, `owner_key`, `updated_at`, `daily_calorie_target`, `protein_goal_mode`, `daily_protein_target_g`, `daily_protein_target_per_kg`
FROM `settings`;
