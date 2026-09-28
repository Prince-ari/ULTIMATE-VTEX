CREATE TABLE `card_vault` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`wallet_type` enum('PERSONAL','PROFESSIONAL') NOT NULL,
	`card_id` bigint NOT NULL,
	`key_id` varchar(16) NOT NULL,
	`pan_enc` varchar(400),
	`pan_fingerprint` char(64),
	`cvv_enc` varchar(200),
	`pin_enc` varchar(200),
	`set_by` bigint,
	`last_revealed_at` datetime,
	`last_revealed_by` bigint,
	`reveal_count` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `card_vault_id` PRIMARY KEY(`id`),
	CONSTRAINT `card_vault_card_unique` UNIQUE(`wallet_type`,`card_id`),
	CONSTRAINT `card_vault_pan_fingerprint_unique` UNIQUE(`pan_fingerprint`)
);
--> statement-breakpoint
ALTER TABLE `card_vault` ADD CONSTRAINT `card_vault_set_by_users_id_fk` FOREIGN KEY (`set_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `card_vault` ADD CONSTRAINT `card_vault_last_revealed_by_users_id_fk` FOREIGN KEY (`last_revealed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `card_vault_key_idx` ON `card_vault` (`key_id`);