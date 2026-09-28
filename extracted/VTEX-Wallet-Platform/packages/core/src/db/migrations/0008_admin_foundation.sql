ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','agent','user','super_admin','account_manager') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `logs` ADD `actor_role` varchar(20);--> statement-breakpoint
ALTER TABLE `logs` ADD `session_jti` varchar(64);--> statement-breakpoint
ALTER TABLE `logs` ADD `ip` varchar(45);--> statement-breakpoint
ALTER TABLE `logs` ADD `request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `logs` ADD `wallet_type` enum('PERSONAL','PROFESSIONAL');--> statement-breakpoint
ALTER TABLE `logs` ADD `holder_id` bigint;--> statement-breakpoint
ALTER TABLE `logs` ADD `support_session_id` bigint;--> statement-breakpoint
ALTER TABLE `otp_codes` ADD `code_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `otp_codes` ADD `attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_active_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `temp_password_expires_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` datetime;--> statement-breakpoint
CREATE INDEX `logs_holder_idx` ON `logs` (`wallet_type`,`holder_id`,`created_at`);