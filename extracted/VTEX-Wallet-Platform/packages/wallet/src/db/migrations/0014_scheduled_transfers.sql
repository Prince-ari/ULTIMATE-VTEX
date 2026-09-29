CREATE TABLE `scheduled_transfers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`from_wallet_account_id` bigint NOT NULL,
	`to_wallet_account_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`description` varchar(250),
	`scheduled_at` datetime NOT NULL,
	`status` enum('pending','executed','cancelled','failed') NOT NULL DEFAULT 'pending',
	`failure_reason` varchar(250),
	`created_by` bigint NOT NULL,
	`transaction_id` bigint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`executed_at` datetime,
	CONSTRAINT `scheduled_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `scheduled_transfers` ADD CONSTRAINT `scheduled_transfers_from_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`from_wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scheduled_transfers` ADD CONSTRAINT `scheduled_transfers_to_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`to_wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scheduled_transfers` ADD CONSTRAINT `scheduled_transfers_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scheduled_transfers` ADD CONSTRAINT `scheduled_transfers_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `scheduled_transfers_due_idx` ON `scheduled_transfers` (`status`,`scheduled_at`);
--> statement-breakpoint
CREATE INDEX `scheduled_transfers_from_idx` ON `scheduled_transfers` (`from_wallet_account_id`,`status`);
--> statement-breakpoint
CREATE INDEX `scheduled_transfers_to_idx` ON `scheduled_transfers` (`to_wallet_account_id`,`status`);
