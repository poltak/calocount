ALTER TABLE `meal_logs` ADD `external_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_logs_external_request_id_idx` ON `meal_logs` (`external_request_id`);