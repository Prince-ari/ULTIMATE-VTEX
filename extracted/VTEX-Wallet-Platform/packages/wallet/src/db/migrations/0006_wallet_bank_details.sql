CREATE TABLE IF NOT EXISTS `wallet_bank_details` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `wallet_account_id` BIGINT NOT NULL,
  `iban` CHAR(34) NOT NULL,
  `bic` CHAR(11) NOT NULL,
  `status` ENUM('active','revoked') NOT NULL DEFAULT 'active',
  `reason` VARCHAR(250),
  `created_by` BIGINT NOT NULL,
  `revoked_at` DATETIME,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `wallet_bank_details_account_idx` (`wallet_account_id`, `created_at`),
  KEY `wallet_bank_details_iban_idx` (`iban`),
  CONSTRAINT `wallet_bank_details_account_fk` FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `wallet_bank_details_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
