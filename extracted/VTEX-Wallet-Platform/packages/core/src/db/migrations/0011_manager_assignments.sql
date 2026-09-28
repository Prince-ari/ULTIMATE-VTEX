CREATE TABLE `manager_assignments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`manager_user_id` bigint NOT NULL,
	`wallet_type` enum('PERSONAL','PROFESSIONAL') NOT NULL,
	`holder_id` bigint NOT NULL,
	`assigned_by` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `manager_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `manager_assignments_unique` UNIQUE(`manager_user_id`,`wallet_type`,`holder_id`)
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `kind` enum('notification','suggestion') DEFAULT 'notification' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `wallet_type` enum('PERSONAL','PROFESSIONAL');--> statement-breakpoint
ALTER TABLE `notifications` ADD `holder_id` bigint;--> statement-breakpoint
ALTER TABLE `manager_assignments` ADD CONSTRAINT `manager_assignments_manager_user_id_users_id_fk` FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manager_assignments` ADD CONSTRAINT `manager_assignments_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `manager_assignments_holder_idx` ON `manager_assignments` (`wallet_type`,`holder_id`);--> statement-breakpoint
CREATE INDEX `notifications_kind_wallet_idx` ON `notifications` (`kind`,`wallet_type`,`holder_id`);--> statement-breakpoint
CREATE INDEX `notifications_sender_idx` ON `notifications` (`created_by`,`kind`);