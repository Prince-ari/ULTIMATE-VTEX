-- Réparation : les migrations 0004 (PIN carte), 0005 (wallet_permissions) et 0006 (wallet_bank_details) existent sur
-- disque mais n'ont jamais été inscrites au journal Drizzle. Sur une base créée uniquement par `db:migrate`, ces objets
-- manquaient. Cette migration est IDEMPOTENTE : elle ne fait rien sur une base qui les possède déjà (MySQL 8 et MariaDB).
SET @vtex_stmt = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `cards` ADD `pin_hash` varchar(128)', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'pin_hash');--> statement-breakpoint
PREPARE vtex_stmt FROM @vtex_stmt;--> statement-breakpoint
EXECUTE vtex_stmt;--> statement-breakpoint
DEALLOCATE PREPARE vtex_stmt;--> statement-breakpoint
SET @vtex_stmt = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `cards` ADD `pin_updated_at` datetime', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'pin_updated_at');--> statement-breakpoint
PREPARE vtex_stmt FROM @vtex_stmt;--> statement-breakpoint
EXECUTE vtex_stmt;--> statement-breakpoint
DEALLOCATE PREPARE vtex_stmt;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wallet_permissions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `permission` ENUM('wallet.read','wallet.accounts.manage','wallet.cards.manage','wallet.cards.pin','wallet.transactions.review','wallet.transactions.adjust','wallet.beneficiaries.manage','wallet.savings.manage','wallet.emergency') NOT NULL,
  `allowed` BOOLEAN NOT NULL DEFAULT FALSE,
  `updated_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_permissions_user_permission_unique` (`user_id`, `permission`),
  KEY `wallet_permissions_user_idx` (`user_id`),
  CONSTRAINT `wallet_permissions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wallet_permissions_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);--> statement-breakpoint
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
