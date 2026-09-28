CREATE TABLE `beneficiaries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`full_name` varchar(160) NOT NULL,
	`nickname` varchar(80),
	`iban` char(34) NOT NULL,
	`bic` char(11),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`verified_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `beneficiaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `beneficiaries_user_iban_unique` UNIQUE(`user_id`,`iban`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`wallet_account_id` bigint NOT NULL,
	`cardholder_name` varchar(140) NOT NULL,
	`last_four` char(4) NOT NULL,
	`network` enum('visa','mastercard','cb') NOT NULL DEFAULT 'visa',
	`label` varchar(80) NOT NULL DEFAULT 'Carte VTEX',
	`token_reference` varchar(160) NOT NULL,
	`status` enum('active','frozen','expired','cancelled') NOT NULL DEFAULT 'active',
	`daily_limit_cents` bigint NOT NULL DEFAULT 100000,
	`monthly_limit_cents` bigint NOT NULL DEFAULT 300000,
	`per_transaction_limit_cents` bigint NOT NULL DEFAULT 50000,
	`online_payments_enabled` boolean NOT NULL DEFAULT true,
	`contactless_enabled` boolean NOT NULL DEFAULT true,
	`cash_withdrawal_enabled` boolean NOT NULL DEFAULT true,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `cards_token_reference_unique` UNIQUE(`token_reference`)
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`wallet_account_id` bigint NOT NULL,
	`name` varchar(100) NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`target_cents` bigint NOT NULL,
	`current_cents` bigint NOT NULL DEFAULT 0,
	`due_at` datetime,
	`status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `savings_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`reference` varchar(64) NOT NULL,
	`idempotency_key` varchar(100),
	`wallet_account_id` bigint NOT NULL,
	`counterparty_wallet_account_id` bigint,
	`beneficiary_id` bigint,
	`initiated_by_user_id` bigint NOT NULL,
	`type` enum('transfer_internal','transfer_external','split_debit','split_credit','savings_deposit','savings_withdrawal','card_payment','fee') NOT NULL,
	`direction` enum('debit','credit') NOT NULL,
	`status` enum('pending','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`amount_cents` bigint NOT NULL,
	`fee_cents` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL,
	`description` varchar(250),
	`metadata` json,
	`scheduled_at` datetime,
	`completed_at` datetime,
	`rejected_reason` varchar(250),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `transactions_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`iban` char(34) NOT NULL,
	`bic` char(11),
	`currency` char(3) NOT NULL DEFAULT 'EUR',
	`available_balance_cents` bigint NOT NULL DEFAULT 0,
	`reserved_balance_cents` bigint NOT NULL DEFAULT 0,
	`status` enum('active','frozen','closed') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_accounts_iban_unique` UNIQUE(`iban`),
	CONSTRAINT `wallet_accounts_user_currency_unique` UNIQUE(`user_id`,`currency`)
);
--> statement-breakpoint
CREATE TABLE `wallet_idempotency_keys` (
	`idempotency_key` varchar(100) NOT NULL,
	`user_id` bigint NOT NULL,
	`operation` varchar(80) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`transaction_id` bigint,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`response` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `wallet_idempotency_keys_idempotency_key` PRIMARY KEY(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `wallet_ledger_entries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`wallet_account_id` bigint NOT NULL,
	`transaction_id` bigint NOT NULL,
	`entry_kind` enum('available','reserved') NOT NULL DEFAULT 'available',
	`delta_cents` bigint NOT NULL,
	`balance_after_cents` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_ledger_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_ledger_entries_transaction_kind_unique` UNIQUE(`transaction_id`,`entry_kind`)
);
--> statement-breakpoint
ALTER TABLE `beneficiaries` ADD CONSTRAINT `beneficiaries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savings_goals` ADD CONSTRAINT `savings_goals_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savings_goals` ADD CONSTRAINT `savings_goals_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `tx_counterparty_account_fk` FOREIGN KEY (`counterparty_wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_beneficiary_id_beneficiaries_id_fk` FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_initiated_by_user_id_users_id_fk` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_accounts` ADD CONSTRAINT `wallet_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_idempotency_keys` ADD CONSTRAINT `wallet_idempotency_keys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_idempotency_keys` ADD CONSTRAINT `wallet_idempotency_keys_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_ledger_entries` ADD CONSTRAINT `wallet_ledger_entries_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_ledger_entries` ADD CONSTRAINT `wallet_ledger_entries_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `beneficiaries_user_status_idx` ON `beneficiaries` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `cards_account_idx` ON `cards` (`wallet_account_id`);--> statement-breakpoint
CREATE INDEX `cards_status_idx` ON `cards` (`status`);--> statement-breakpoint
CREATE INDEX `savings_goals_user_status_idx` ON `savings_goals` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `savings_goals_account_idx` ON `savings_goals` (`wallet_account_id`);--> statement-breakpoint
CREATE INDEX `transactions_account_created_idx` ON `transactions` (`wallet_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_status_created_idx` ON `transactions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_beneficiary_idx` ON `transactions` (`beneficiary_id`);--> statement-breakpoint
CREATE INDEX `wallet_accounts_status_idx` ON `wallet_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `wallet_idempotency_keys_user_operation_idx` ON `wallet_idempotency_keys` (`user_id`,`operation`);--> statement-breakpoint
CREATE INDEX `wallet_idempotency_keys_expires_idx` ON `wallet_idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `wallet_ledger_entries_account_created_idx` ON `wallet_ledger_entries` (`wallet_account_id`,`created_at`);
