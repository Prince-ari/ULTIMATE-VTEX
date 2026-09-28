CREATE TABLE `support_sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`started_by` bigint NOT NULL,
	`wallet_type` enum('PERSONAL','PROFESSIONAL') NOT NULL,
	`holder_id` bigint NOT NULL,
	`mode` enum('read_only','operator') NOT NULL DEFAULT 'read_only',
	`reason` varchar(250) NOT NULL,
	`started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	`ended_at` datetime,
	`ended_reason` enum('manual','expired','superseded'),
	CONSTRAINT `support_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `support_sessions` ADD CONSTRAINT `support_sessions_started_by_users_id_fk` FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `support_sessions_starter_active_idx` ON `support_sessions` (`started_by`,`ended_at`);--> statement-breakpoint
CREATE INDEX `support_sessions_holder_idx` ON `support_sessions` (`wallet_type`,`holder_id`,`started_at`);