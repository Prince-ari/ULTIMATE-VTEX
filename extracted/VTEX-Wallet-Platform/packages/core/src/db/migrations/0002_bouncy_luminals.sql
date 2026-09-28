ALTER TABLE `settings` MODIFY COLUMN `default_theme` enum('light','dark') NOT NULL DEFAULT 'light';--> statement-breakpoint
ALTER TABLE `settings` ADD `stats_active_users_override` int;--> statement-breakpoint
ALTER TABLE `settings` ADD `stats_platform_balance_cents_override` bigint;--> statement-breakpoint
ALTER TABLE `settings` ADD `stats_transactions_this_month_override` int;