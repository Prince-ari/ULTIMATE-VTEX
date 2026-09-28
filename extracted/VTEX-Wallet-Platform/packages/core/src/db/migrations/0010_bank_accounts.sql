CREATE TABLE `bank_accounts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`wallet_type` enum('PERSONAL','PROFESSIONAL') NOT NULL,
	`holder_id` bigint,
	`ledger_account_id` bigint,
	`kind` enum('MAIN','SUB') NOT NULL,
	`label` varchar(100) NOT NULL,
	`account_holder_name` varchar(160) NOT NULL,
	`bank_name` varchar(120) NOT NULL DEFAULT 'VTEX',
	`currency` char(3) NOT NULL,
	`iban_enc` varchar(400) NOT NULL,
	`iban_fingerprint` char(64) NOT NULL,
	`iban_last4` char(4) NOT NULL,
	`iban_country` char(2) NOT NULL,
	`bic` char(11),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`key_id` varchar(16) NOT NULL,
	`created_by` bigint,
	`updated_by` bigint,
	`disabled_at` datetime,
	`main_slot` varchar(40) GENERATED ALWAYS AS ((IF(`kind` = 'MAIN' AND `status` = 'active' AND `ledger_account_id` IS NOT NULL, CONCAT(`wallet_type`, ':', `ledger_account_id`), NULL))) STORED,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `bank_accounts_iban_fingerprint_unique` UNIQUE(`iban_fingerprint`),
	CONSTRAINT `bank_accounts_main_slot_unique` UNIQUE(`main_slot`)
);
--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `bank_accounts_holder_idx` ON `bank_accounts` (`wallet_type`,`holder_id`,`status`);--> statement-breakpoint
CREATE INDEX `bank_accounts_ledger_idx` ON `bank_accounts` (`wallet_type`,`ledger_account_id`,`kind`,`status`);--> statement-breakpoint
CREATE INDEX `bank_accounts_status_idx` ON `bank_accounts` (`status`,`kind`);