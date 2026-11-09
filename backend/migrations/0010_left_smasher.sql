ALTER TABLE `meal_logs` ADD `saved_entry_id` text;--> statement-breakpoint
UPDATE `meal_logs`
SET `saved_entry_id` = (
	SELECT `saved_entries`.`id`
	FROM `saved_entries`
	WHERE `saved_entries`.`owner_key` = `meal_logs`.`owner_key`
		AND json_extract(`saved_entries`.`snapshot_json`, '$.caption') = `meal_logs`.`caption`
		AND COALESCE(json_extract(`saved_entries`.`snapshot_json`, '$.mealType'), '') = COALESCE(`meal_logs`.`meal_type`, '')
		AND COALESCE((SELECT SUM(CAST(json_extract(`value`, '$.calories') AS REAL)) FROM json_each(`saved_entries`.`snapshot_json`, '$.items')), 0) = `meal_logs`.`total_calories`
		AND COALESCE((SELECT SUM(CAST(json_extract(`value`, '$.proteinG') AS REAL)) FROM json_each(`saved_entries`.`snapshot_json`, '$.items')), 0) = `meal_logs`.`total_protein_g`
		AND COALESCE((SELECT SUM(CAST(json_extract(`value`, '$.carbsG') AS REAL)) FROM json_each(`saved_entries`.`snapshot_json`, '$.items')), 0) = `meal_logs`.`total_carbs_g`
		AND COALESCE((SELECT SUM(CAST(json_extract(`value`, '$.fatG') AS REAL)) FROM json_each(`saved_entries`.`snapshot_json`, '$.items')), 0) = `meal_logs`.`total_fat_g`
	ORDER BY `saved_entries`.`created_at` DESC
	LIMIT 1
)
WHERE `meal_logs`.`source` = 'saved-entry'
	AND `meal_logs`.`saved_entry_id` IS NULL;--> statement-breakpoint
CREATE INDEX `meal_logs_owner_saved_entry_idx` ON `meal_logs` (`owner_key`,`saved_entry_id`);
