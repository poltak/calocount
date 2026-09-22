ALTER TABLE `meal_items` ADD `preformed_vitamin_a_mcg_rae` real;--> statement-breakpoint
ALTER TABLE `meal_items` ADD `supplemental_magnesium_mg` real;--> statement-breakpoint
ALTER TABLE `meal_items` ADD `folic_acid_mcg` real;--> statement-breakpoint
ALTER TABLE `meal_items` ADD `supplemental_vitamin_e_mg` real;--> statement-breakpoint
ALTER TABLE `meal_items` ADD `nutrient_provenance_json` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `vitamin_b6_us_fnb_adult_ul_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `vitamin_b6_us_fnb_adult_ul_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `us_fnb_adult_ul_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `us_fnb_adult_ul_confirmed_at` integer;