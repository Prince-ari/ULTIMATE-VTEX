CREATE TABLE `business_topups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`reference` varchar(64) NOT NULL,
	`idempotency_key` varchar(100) NOT NULL,
	`business_id` bigint NOT NULL,
	`business_wallet_account_id` bigint NOT NULL,
	`initiated_by_user_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`status` enum('pending','requires_action','processing','succeeded','failed','canceled') NOT NULL DEFAULT 'pending',
	`stripe_mode` enum('sim','test','live') NOT NULL,
	`stripe_payment_intent_id` varchar(80),
	`card_brand` varchar(24),
	`card_last4` char(4),
	`billing_name` varchar(160),
	`failure_code` varchar(64),
	`failure_message` varchar(250),
	`transaction_id` bigint,
	`credited_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `business_topups_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_topups_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `business_topups_idempotency_key_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `business_topups_intent_unique` UNIQUE(`stripe_payment_intent_id`)
);
--> statement-breakpoint
ALTER TABLE `business_transactions` MODIFY COLUMN `type` enum('payout','transfer','card_payment','invoice_payment','payment_link','checkout','fee','adjustment','refund','topup') NOT NULL;--> statement-breakpoint
ALTER TABLE `business_topups` ADD CONSTRAINT `business_topups_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_topups` ADD CONSTRAINT `business_topups_initiated_by_user_id_users_id_fk` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_topups` ADD CONSTRAINT `business_topups_transaction_id_business_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `business_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_topups` ADD CONSTRAINT `business_topups_wallet_account_fk` FOREIGN KEY (`business_wallet_account_id`) REFERENCES `business_wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_topups_business_created_idx` ON `business_topups` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_topups_status_idx` ON `business_topups` (`status`);