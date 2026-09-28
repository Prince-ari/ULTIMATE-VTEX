CREATE TABLE `leads` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`email` varchar(255),
	`phone` varchar(32),
	`source` varchar(100),
	`status` enum('new','contacted','qualified','converted','lost') NOT NULL DEFAULT 'new',
	`notes` json NOT NULL,
	`converted_user_id` bigint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`actor_id` bigint,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50) NOT NULL,
	`target_id` bigint NOT NULL,
	`detail` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`notification_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notification_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_reads_unique` UNIQUE(`notification_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`target_user_id` bigint,
	`title` varchar(120) NOT NULL,
	`body` varchar(500) NOT NULL,
	`status` enum('draft','scheduled','sent') NOT NULL DEFAULT 'sent',
	`scheduled_at` datetime,
	`sent_at` datetime,
	`created_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`user_id` bigint NOT NULL,
	`code` char(6) NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `otp_codes_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`bucket_key` varchar(191) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`resets_at` datetime(3) NOT NULL,
	CONSTRAINT `rate_limit_buckets_bucket_key` PRIMARY KEY(`bucket_key`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`jti` varchar(64) NOT NULL,
	`user_id` bigint NOT NULL,
	`device` varchar(255),
	`ip` varchar(45),
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`revoked_at` datetime,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_jti_unique` UNIQUE(`jti`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` tinyint NOT NULL DEFAULT 1,
	`platform_name` varchar(100) NOT NULL,
	`logo_url` varchar(500),
	`default_theme` enum('light','dark') NOT NULL DEFAULT 'dark',
	`maintenance_mode` boolean NOT NULL DEFAULT false,
	`maintenance_message` varchar(500),
	`support_email` varchar(255) NOT NULL,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`subject` varchar(200) NOT NULL,
	`status` enum('open','in_progress','resolved') NOT NULL DEFAULT 'open',
	`priority` enum('low','normal','high') NOT NULL DEFAULT 'normal',
	`messages` json NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(32),
	`password_hash` varchar(255) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`avatar_url` varchar(500),
	`role` enum('admin','agent','user') NOT NULL DEFAULT 'user',
	`status` enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
	`kyc_verified` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` datetime,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_converted_user_id_users_id_fk` FOREIGN KEY (`converted_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `logs` ADD CONSTRAINT `logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_notification_id_notifications_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_target_user_id_users_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_converted_idx` ON `leads` (`converted_user_id`);--> statement-breakpoint
CREATE INDEX `logs_actor_idx` ON `logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `logs_target_idx` ON `logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `logs_created_idx` ON `logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `notification_reads_user_idx` ON `notification_reads` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_target_idx` ON `notifications` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_user_idx` ON `support_tickets` (`user_id`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `support_tickets_priority_idx` ON `support_tickets` (`priority`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
