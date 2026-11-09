CREATE TABLE `ai_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`adapter` text DEFAULT 'openrouter' NOT NULL,
	`endpoint` text,
	`primary_model` text NOT NULL,
	`fallback_models_json` text DEFAULT '[]' NOT NULL,
	`required_capabilities_json` text DEFAULT '["image","structured_outputs"]' NOT NULL,
	`privacy_policy_json` text DEFAULT '{"zdr":true,"data_collection":"deny"}' NOT NULL,
	`max_input_price` real,
	`max_output_price` real,
	`prompt_version` text DEFAULT 'v1' NOT NULL,
	`schema_version` text DEFAULT 'v1' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_profiles_owner_enabled_idx` ON `ai_profiles` (`owner_key`,`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_profiles_owner_id_idx` ON `ai_profiles` (`owner_key`,`id`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text,
	`job_id` text,
	`owner_key` text NOT NULL,
	`request_id` text,
	`adapter` text NOT NULL,
	`requested_model` text,
	`actual_model` text,
	`upstream_provider` text,
	`fallback_from_model` text,
	`prompt_version` text,
	`schema_version` text,
	`input_text_tokens` integer,
	`input_image_tokens` integer,
	`output_tokens` integer,
	`reported_cost_usd` real,
	`raw_usage_json` text,
	`status` text DEFAULT 'complete' NOT NULL,
	`error_code` text,
	`latency_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_runs_owner_created_idx` ON `ai_runs` (`owner_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_owner_meal_created_idx` ON `ai_runs` (`owner_key`,`meal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`available_after` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_jobs_owner_state_available_idx` ON `analysis_jobs` (`owner_key`,`state`,`available_after`);--> statement-breakpoint
CREATE INDEX `analysis_jobs_meal_id_idx` ON `analysis_jobs` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'serving' NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`confidence` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_id_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_items_owner_meal_id_idx` ON `meal_items` (`owner_key`,`meal_id`);--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`consumed_at` integer NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`meal_type` text,
	`status` text DEFAULT 'complete' NOT NULL,
	`photo_key` text,
	`photo_mime_type` text,
	`photo_size_bytes` integer,
	`total_calories` real DEFAULT 0 NOT NULL,
	`total_protein_g` real DEFAULT 0 NOT NULL,
	`total_carbs_g` real DEFAULT 0 NOT NULL,
	`total_fat_g` real DEFAULT 0 NOT NULL,
	`confidence` real,
	`assumptions_json` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_logs_owner_consumed_at_idx` ON `meal_logs` (`owner_key`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `meal_logs_owner_status_updated_idx` ON `meal_logs` (`owner_key`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `meal_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text DEFAULT 'correction' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_revisions_owner_meal_created_idx` ON `meal_revisions` (`owner_key`,`meal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`telegram_user_id` text,
	`telegram_chat_id` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`daily_calorie_target` integer,
	`daily_protein_target_g` real,
	`active_ai_profile_id` text,
	`photo_retention_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_owner_key_idx` ON `settings` (`owner_key`);--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`update_id` integer NOT NULL,
	`chat_id` text,
	`telegram_user_id` text,
	`meal_id` text,
	`payload_json` text NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_updates_owner_update_idx` ON `telegram_updates` (`owner_key`,`update_id`);--> statement-breakpoint
CREATE INDEX `telegram_updates_owner_created_idx` ON `telegram_updates` (`owner_key`,`created_at`);