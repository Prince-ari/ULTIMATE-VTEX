CREATE TABLE `payment_link_payments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`reference` varchar(64) NOT NULL,
	`idempotency_key` varchar(100),
	`payment_link_id` bigint NOT NULL,
	`business_id` bigint NOT NULL,
	`business_wallet_account_id` bigint NOT NULL,
	`amount_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`status` enum('pending','requires_action','processing','succeeded','failed','canceled','refunded') NOT NULL DEFAULT 'pending',
	`payer_name` varchar(160),
	`payer_email` varchar(160),
	`payer_ip` varchar(45),
	`stripe_mode` enum('sim','test','live') NOT NULL,
	`stripe_payment_intent_id` varchar(80),
	`card_brand` varchar(32),
	`card_last4` char(4),
	`failure_code` varchar(64),
	`failure_message` varchar(250),
	`transaction_id` bigint,
	`credited_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payment_link_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_link_payments_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `payment_link_payments_idempotency_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `payment_link_payments_intent_unique` UNIQUE(`stripe_payment_intent_id`)
);
--> statement-breakpoint
ALTER TABLE `payment_links` MODIFY COLUMN `status` enum('active','expired','draft','disabled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `payment_links` ADD `target_account_id` bigint;--> statement-breakpoint
ALTER TABLE `payment_links` ADD `description` varchar(250);--> statement-breakpoint
ALTER TABLE `payment_links` ADD `expires_at` datetime;--> statement-breakpoint
ALTER TABLE `payment_links` ADD `updated_by` bigint;--> statement-breakpoint
ALTER TABLE `payment_link_payments` ADD CONSTRAINT `payment_link_payments_payment_link_id_payment_links_id_fk` FOREIGN KEY (`payment_link_id`) REFERENCES `payment_links`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_link_payments` ADD CONSTRAINT `payment_link_payments_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_link_payments_link_status_idx` ON `payment_link_payments` (`payment_link_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_link_payments_business_created_idx` ON `payment_link_payments` (`business_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_links_target_idx` ON `payment_links` (`target_account_id`);
--> statement-breakpoint
-- Rattrapage : un ancien lien (sans compte cible) credite le premier compte de son entreprise, comme avant.
UPDATE `payment_links` pl SET pl.`target_account_id` = (SELECT MIN(a.`id`) FROM `business_wallet_accounts` a WHERE a.`business_id` = pl.`business_id`) WHERE pl.`target_account_id` IS NULL;
