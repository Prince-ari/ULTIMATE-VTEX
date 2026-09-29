ALTER TABLE `wallet_accounts` ADD `transfers_locked` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `wallet_accounts` ADD `unlock_requested_at` datetime;
--> statement-breakpoint
-- Les comptes déjà ouverts avant cette migration ne doivent pas se retrouver verrouillés du jour au lendemain :
-- seuls les comptes créés APRÈS cette migration démarrent verrouillés (choix applicatif dans bootstrapWallet/createAdminWallet).
UPDATE `wallet_accounts` SET `transfers_locked` = false;
--> statement-breakpoint
CREATE TABLE `transfer_codes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`wallet_account_id` bigint NOT NULL,
	`purpose` enum('unlock','transfer') NOT NULL,
	`code` char(6) NOT NULL,
	`code_hash` varchar(64),
	`attempts` int NOT NULL DEFAULT 0,
	`sent_by` bigint,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `transfer_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_codes_account_purpose_unique` UNIQUE(`wallet_account_id`,`purpose`)
);
--> statement-breakpoint
ALTER TABLE `transfer_codes` ADD CONSTRAINT `transfer_codes_wallet_account_id_wallet_accounts_id_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_codes` ADD CONSTRAINT `transfer_codes_sent_by_users_id_fk` FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
